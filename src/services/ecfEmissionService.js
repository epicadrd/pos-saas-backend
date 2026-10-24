import { Op } from "sequelize";
import {
  Tenant,
  Invoice,
  InvoiceItem,
  PosSale,
  PosSaleItem,
  ElectronicInvoice,
  ElectronicInvoicingRequest,
  FiscalNumberUsage,
} from "../models/index.js";
import {
  sendECFToMSeller,
  getECFStatusFromMSeller,
  getMSellerEnvironment,
} from "./msellerService.js";
import {
  FiscalNumberError,
  reserveFiscalNumber,
  voidFiscalNumber,
  todayInDR,
  dateOnlyToDGII,
} from "./fiscalSequenceService.js";

// A partir de este monto la factura de consumo exige identificar al comprador
const CONSUMER_ID_REQUIRED_FROM = 250000;

const POS_SEND_TIMEOUT_MS = 25000;

const DISPLAY_STATUS = {
  RESERVED: "Pendiente",
  FAILED: "Error",
  SENT: "Enviado",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  VOIDED: "Anulado",
};

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

const isValidTaxId = (value) => [9, 11].includes(digitsOnly(value).length);

// Fecha (DD-MM-YYYY) de un instante en hora de República Dominicana
const dateTimeToDGII = (value) => {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value ? new Date(value) : new Date());

  return dateOnlyToDGII(iso);
};

/*
 * Estados de MSeller (versión actual y anterior de su API):
 * En Cola, Enviado a la DGII, En Proceso, Aceptado, Aceptado Condicional,
 * Rechazado, No encontrado, Error / RECIBIDO, PROCESANDO, ACEPTADO...
 */
export const mapMSellerStatus = (rawStatus) => {
  const status = String(rawStatus || "").trim().toLowerCase();

  if (!status) return "SENT";
  if (status.startsWith("aceptado") || status === "accepted") return "ACCEPTED";
  if (status.startsWith("rechazado") || status === "rejected") return "REJECTED";

  return "SENT";
};

const extractErrorMessage = (error) => {
  const data = error?.response?.data;

  if (data) {
    if (typeof data === "string") return data.slice(0, 1000);
    if (data.message) return String(data.message).slice(0, 1000);
    if (data.error) return String(data.error).slice(0, 1000);

    return JSON.stringify(data).slice(0, 1000);
  }

  return String(error?.message || "Error desconocido").slice(0, 1000);
};

/*
 * "failed": MSeller no registró el documento; se puede reintentar con
 * el mismo número. "uncertain": no sabemos si lo recibió; antes de
 * reenviar hay que consultarlo.
 */
const classifySendError = (error) => {
  const url = String(error?.config?.url || "");

  // Si falló la autenticación, el documento nunca se envió
  if (url.includes("/customer/authentication")) return "failed";

  if (error?.response) {
    return error.response.status >= 500 ? "uncertain" : "failed";
  }

  if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(error?.code)) {
    return "failed";
  }

  if (error?.isAxiosError || error?.request) return "uncertain";

  // Errores locales previos a la llamada (configuración, credenciales)
  return "failed";
};

const extractDgiiMessages = (result) => {
  const responses = Array.isArray(result?.dgiiResponse)
    ? result.dgiiResponse
    : [];

  const messages = [];

  for (const entry of responses) {
    try {
      const parsed = typeof entry === "string" ? JSON.parse(entry) : entry;

      for (const message of parsed?.mensajes || []) {
        if (message?.valor) messages.push(String(message.valor));
      }

      if (parsed?.mensaje) messages.push(String(parsed.mensaje));
    } catch {
      // Respuesta no JSON: se ignora
    }
  }

  return [...new Set(messages)].join(" | ").slice(0, 1000);
};

const hasDocumentData = (result) =>
  Boolean(
    result &&
      typeof result === "object" &&
      (result.ncf || result.ecf || result.securityCode || result.status)
  );

// Consulta si MSeller ya tiene el e-NCF. null = no lo tiene.
const lookupInMSeller = async (tenantId, eNcf) => {
  try {
    const result = await getECFStatusFromMSeller(tenantId, eNcf);
    return hasDocumentData(result) ? result : null;
  } catch (error) {
    if (error?.response?.status === 404) return null;

    throw new FiscalNumberError(
      `No se pudo confirmar con MSeller si el e-NCF ${eNcf} ya fue recibido. Intenta de nuevo en unos minutos; no se reenviará hasta confirmarlo.`,
      503,
      "MSELLER_UNVERIFIED"
    );
  }
};

const applyMSellerResult = async (usage, result) => {
  const status = mapMSellerStatus(result?.status);
  const isFinal = status === "ACCEPTED" || status === "REJECTED";

  await usage.update({
    status,
    msellerStatus: result?.status ? String(result.status).slice(0, 60) : null,
    sentAt: usage.sentAt || new Date(),
    resolvedAt: isFinal ? new Date() : null,
    lastError:
      status === "REJECTED"
        ? extractDgiiMessages(result) || "Rechazado por la DGII"
        : null,
  });

  return usage;
};

export const getDisplayStatus = (usage, result) =>
  result?.status ? String(result.status) : DISPLAY_STATUS[usage.status];

export const getActiveFiscalUsage = (tenantId, documentType, documentId, transaction) =>
  FiscalNumberUsage.findOne({
    where: {
      tenantId,
      documentType,
      documentId,
      status: { [Op.ne]: "VOIDED" },
    },
    order: [["id", "DESC"]],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

export const getEmissionTenant = async (tenantId) => {
  const tenant = await Tenant.findByPk(tenantId);

  if (tenant?.country !== "DO") {
    throw new FiscalNumberError(
      "La facturación electrónica solo aplica para República Dominicana."
    );
  }

  const activeRequest = await ElectronicInvoicingRequest.findOne({
    where: { tenantId, status: "active" },
    attributes: ["id"],
  });

  if (!activeRequest) {
    throw new FiscalNumberError(
      "La solicitud de facturación electrónica de esta empresa todavía no ha sido aceptada.",
      403
    );
  }

  if (tenant.electronicInvoicingEnabled !== true) {
    throw new FiscalNumberError(
      "La facturación electrónica está desactivada para esta empresa.",
      403
    );
  }

  if (!isValidTaxId(tenant.rnc)) {
    throw new FiscalNumberError(
      "El RNC de la empresa no es válido. Corrígelo en la configuración de la empresa."
    );
  }

  return tenant;
};

// true si la empresa cumple los requisitos para emitir (sin lanzar error)
export const canTenantEmit = async (tenantId) => {
  try {
    await getEmissionTenant(tenantId);
    return true;
  } catch {
    return false;
  }
};

const validateBuyer = ({ tipoECF, customerRnc, customerName, total }) => {
  if (tipoECF === "31") {
    if (!isValidTaxId(customerRnc)) {
      throw new FiscalNumberError(
        "La factura de crédito fiscal requiere un RNC (9 dígitos) o cédula (11 dígitos) válido del cliente."
      );
    }

    if (!String(customerName || "").trim()) {
      throw new FiscalNumberError(
        "La factura de crédito fiscal requiere el nombre o razón social del cliente."
      );
    }
  }

  if (
    tipoECF === "32" &&
    Number(total) >= CONSUMER_ID_REQUIRED_FROM &&
    !isValidTaxId(customerRnc)
  ) {
    throw new FiscalNumberError(
      "Las facturas de consumo desde RD$250,000 requieren el RNC o la cédula del cliente."
    );
  }
};

/*
 * Validación en caja, antes de registrar la venta: lo que impediría
 * emitir el e-CF se corrige en el momento y no después de cobrar.
 */
export const validatePosSaleBeforeCharge = ({
  receiptType,
  customerRnc,
  customerName,
  total,
  taxEnabled,
  taxRate,
}) => {
  validateBuyer({
    tipoECF: receiptType === "credit_fiscal" ? "31" : "32",
    customerRnc,
    customerName,
    total,
  });

  if (taxEnabled && !isSupportedItbisRate(taxRate)) {
    throw new FiscalNumberError(
      `La tasa de ITBIS configurada (${taxRate}%) no es válida para facturación electrónica. Usa 18% o 16% en la configuración de la empresa.`
    );
  }
};

const buildBuyer = ({ tipoECF, customerRnc, customerName }) => {
  if (isValidTaxId(customerRnc)) {
    return {
      RNCComprador: digitsOnly(customerRnc),
      RazonSocialComprador:
        String(customerName || "").trim() ||
        (tipoECF === "32" ? "Consumidor Final" : ""),
    };
  }

  return {
    RNCComprador: "00000000000",
    RazonSocialComprador: "Consumidor Final",
  };
};

const buildIdDoc = ({ tipoECF, eNcf, sequence, tipoPago }) => {
  const idDoc = { TipoeCF: tipoECF, eNCF: eNcf };

  // La factura de consumo no lleva fecha de vencimiento de secuencia
  if (tipoECF !== "32") {
    idDoc.FechaVencimientoSecuencia = dateOnlyToDGII(sequence.expirationDate);
  }

  return {
    ...idDoc,
    IndicadorEnvioDiferido: "1",
    IndicadorMontoGravado: "0",
    TipoIngresos: "01",
    TipoPago: tipoPago,
    TotalPaginas: 1,
  };
};

const buildInvoicePayload = ({ invoice, tenant, items, tipoECF, eNcf, sequence }) => {
  const taxableAmount = roundMoney(
    items.reduce((acc, item) => acc + Number(item.subtotal || 0), 0)
  );
  const itbisAmount = roundMoney(
    items.reduce((acc, item) => acc + Number(item.tax || 0), 0)
  );
  const totalAmount = roundMoney(Number(invoice.total || 0));

  return {
    ECF: {
      Encabezado: {
        Version: "1.0",
        IdDoc: buildIdDoc({
          tipoECF,
          eNcf,
          sequence,
          tipoPago: Number(invoice.balance || 0) > 0 ? "2" : "1",
        }),
        Emisor: {
          RNCEmisor: digitsOnly(tenant.rnc),
          RazonSocialEmisor: tenant.legalName || tenant.businessName,
          DireccionEmisor: tenant.address || "Direccion no especificada",
          FechaEmision: invoice.invoiceDate
            ? dateOnlyToDGII(invoice.invoiceDate)
            : dateOnlyToDGII(todayInDR()),
        },
        Comprador: buildBuyer({
          tipoECF,
          customerRnc: invoice.customerRnc,
          customerName: invoice.customerName,
        }),
        Totales: {
          MontoGravadoTotal: taxableAmount,
          MontoGravadoI1: taxableAmount,
          MontoExento: 0,
          ITBIS1: 18,
          TotalITBIS: itbisAmount,
          TotalITBIS1: itbisAmount,
          MontoTotal: totalAmount,
          MontoNoFacturable: 0,
        },
      },
      DetallesItems: {
        Item: items.map((item, index) => ({
          NumeroLinea: String(index + 1),
          IndicadorFacturacion: "1",
          NombreItem: item.productName,
          IndicadorBienoServicio: "1",
          CantidadItem: Number(item.quantity || 1),
          UnidadMedida: "43",
          PrecioUnitarioItem: roundMoney(item.unitPrice),
          DescuentoMonto: roundMoney(item.discount),
          MontoItem: roundMoney(item.subtotal),
        })),
      },
      Paginacion: {
        Pagina: [
          {
            PaginaNo: 1,
            NoLineaDesde: 1,
            NoLineaHasta: items.length,
            SubtotalMontoGravadoPagina: taxableAmount,
            SubtotalMontoGravado1Pagina: taxableAmount,
            SubtotalExentoPagina: 0,
            SubtotalItbisPagina: itbisAmount,
            SubtotalItbis1Pagina: itbisAmount,
            MontoSubtotalPagina: totalAmount,
            SubtotalMontoNoFacturablePagina: 0,
          },
        ],
      },
      FechaHoraFirma: "",
    },
  };
};

// Tasas de ITBIS válidas para e-CF y su indicador de facturación
const ITBIS_INDICATORS = { 18: "1", 16: "2" };
const EXEMPT_INDICATOR = "4";

const toCents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (cents) => cents / 100;

// Tasa aplicada en la venta, deducida de lo que realmente se cobró
const detectItbisRate = (taxableCents, taxCents) => {
  if (taxCents === 0) return 0;

  for (const rate of Object.keys(ITBIS_INDICATORS).map(Number)) {
    if (Math.abs(Math.round((taxableCents * rate) / 100) - taxCents) <= 1) {
      return rate;
    }
  }

  return null;
};

/*
 * Líneas del e-CF de una venta POS. El descuento general de la venta
 * no se guarda por producto: se reparte en proporción al monto de cada
 * línea, al centavo, para que la suma de las líneas sea exactamente el
 * monto cobrado.
 */
const buildPosSaleLines = (sale, items) => {
  const lines = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const grossCents = Math.round(quantity * unitPrice * 100);
    const discountCents = Math.min(toCents(item.discountAmount), grossCents);

    return {
      item,
      quantity,
      unitPrice,
      grossCents,
      discountCents,
      baseCents: grossCents - discountCents,
    };
  });

  const lineDiscountCents = lines.reduce((acc, line) => acc + line.discountCents, 0);
  const baseCents = lines.reduce((acc, line) => acc + line.baseCents, 0);
  const orderDiscountCents = Math.max(0, toCents(sale.discountTotal) - lineDiscountCents);

  if (orderDiscountCents > baseCents) {
    throw new FiscalNumberError(
      "El descuento de la venta es mayor que el monto de los productos; no se puede emitir el e-CF."
    );
  }

  const shares = lines.map((line) =>
    baseCents ? Math.floor((line.baseCents * orderDiscountCents) / baseCents) : 0
  );

  // Los centavos que sobran del reparto van a las líneas de mayor monto
  let remainder = orderDiscountCents - shares.reduce((acc, share) => acc + share, 0);
  const byAmount = lines
    .map((_, index) => index)
    .sort((a, b) => lines[b].baseCents - lines[a].baseCents);

  for (let k = 0; remainder > 0; k = (k + 1) % byAmount.length) {
    const index = byAmount[k];

    if (shares[index] < lines[index].baseCents) {
      shares[index] += 1;
      remainder -= 1;
    }
  }

  return lines.map((line, index) => {
    const discountCents = line.discountCents + shares[index];
    return { ...line, discountCents, amountCents: line.grossCents - discountCents };
  });
};

/*
 * Verifica que el e-CF cuadre con lo cobrado antes de reservar un
 * número: un documento que no cuadra sería rechazado y gastaría un e-NCF.
 */
const preparePosSaleDocument = (sale, items) => {
  if (!items.length) {
    throw new FiscalNumberError("La venta no tiene productos.");
  }

  const lines = buildPosSaleLines(sale, items);
  const taxableCents = lines.reduce((acc, line) => acc + line.amountCents, 0);
  const taxCents = toCents(sale.taxTotal);
  const totalCents = taxableCents + taxCents;

  const mismatch =
    Math.abs(taxableCents - (toCents(sale.subtotal) - toCents(sale.discountTotal))) > 1 ||
    Math.abs(totalCents - toCents(sale.total)) > 1;

  if (mismatch) {
    throw new FiscalNumberError(
      "Los montos de esta venta no cuadran entre sí; no se envió a la DGII para no gastar un e-NCF. Contacta a soporte."
    );
  }

  if (totalCents <= 0) {
    throw new FiscalNumberError("No se puede emitir un e-CF de una venta en cero.");
  }

  const rate = detectItbisRate(taxableCents, taxCents);

  if (rate === null) {
    throw new FiscalNumberError(
      "El ITBIS cobrado en esta venta no corresponde al 18% ni al 16%. Revisa la tasa de ITBIS de la empresa."
    );
  }

  return { lines, rate, taxableCents, taxCents, totalCents };
};

// Para validar en caja antes de cobrar
export const isSupportedItbisRate = (rate) =>
  Object.prototype.hasOwnProperty.call(ITBIS_INDICATORS, Number(rate));

const buildPosSaleTotals = ({ rate, taxableCents, taxCents, totalCents }) => {
  if (rate === 0) {
    return {
      MontoExento: fromCents(taxableCents),
      MontoTotal: fromCents(totalCents),
    };
  }

  const n = ITBIS_INDICATORS[rate];

  // El orden de los campos sigue el esquema XML de la DGII
  return {
    MontoGravadoTotal: fromCents(taxableCents),
    [`MontoGravadoI${n}`]: fromCents(taxableCents),
    [`ITBIS${n}`]: rate,
    TotalITBIS: fromCents(taxCents),
    [`TotalITBIS${n}`]: fromCents(taxCents),
    MontoTotal: fromCents(totalCents),
  };
};

const buildPosSalePayload = ({ sale, tenant, document, tipoECF, eNcf, sequence }) => {
  const indicator = document.rate === 0 ? EXEMPT_INDICATOR : ITBIS_INDICATORS[document.rate];

  return {
    ECF: {
      Encabezado: {
        Version: "1.0",
        IdDoc: buildIdDoc({ tipoECF, eNcf, sequence, tipoPago: "1" }),
        Emisor: {
          RNCEmisor: digitsOnly(tenant.rnc),
          RazonSocialEmisor: tenant.legalName || tenant.businessName,
          DireccionEmisor: tenant.address || "Direccion no especificada",
          FechaEmision: dateTimeToDGII(sale.createdAt),
        },
        Comprador: buildBuyer({
          tipoECF,
          customerRnc: sale.customerRnc,
          customerName: sale.customerName,
        }),
        Totales: buildPosSaleTotals(document),
      },
      DetallesItems: {
        Item: document.lines.map((line, index) => ({
          NumeroLinea: String(index + 1),
          IndicadorFacturacion: indicator,
          NombreItem: String(line.item.productName || "Producto").slice(0, 80),
          IndicadorBienoServicio: "1",
          CantidadItem: line.quantity,
          UnidadMedida: "43",
          PrecioUnitarioItem: line.unitPrice,
          ...(line.discountCents > 0
            ? {
                DescuentoMonto: fromCents(line.discountCents),
                TablaSubDescuento: {
                  SubDescuento: [
                    {
                      TipoSubDescuento: "$",
                      MontoSubDescuento: fromCents(line.discountCents),
                    },
                  ],
                },
              }
            : {}),
          MontoItem: fromCents(line.amountCents),
        })),
      },
      FechaHoraFirma: "",
    },
  };
};

const getEnvironmentOrFail = async (tenantId) => {
  try {
    return await getMSellerEnvironment(tenantId);
  } catch (error) {
    throw new FiscalNumberError(error.message, 400, "MSELLER_NOT_CONFIGURED");
  }
};

/*
 * Flujo común: reserva (o reutiliza) el e-NCF, verifica envíos
 * inciertos antes de repetirlos y envía a MSeller.
 */
const emitFiscalDocument = async ({
  tenantId,
  userId,
  documentType,
  documentId,
  tipoECF,
  buildPayload,
  sendOptions,
}) => {
  const environment = await getEnvironmentOrFail(tenantId);

  // Como máximo un reintento: cuando un número incierto resultó no
  // enviado y su secuencia venció, se anula y se toma otro
  for (let round = 0; round < 2; round += 1) {
    const { usage, sequence } = await reserveFiscalNumber({
      tenantId,
      environment,
      tipoECF,
      documentType,
      documentId,
      userId,
    });

    if (usage.status === "SENT" || usage.status === "ACCEPTED") {
      return { usage, result: null, alreadySent: true, environment };
    }

    if (usage.status === "REJECTED") {
      throw new FiscalNumberError(
        `La DGII rechazó el e-NCF ${usage.eNcf}${
          usage.lastError ? `: ${usage.lastError}` : "."
        } Revisa el documento con tu contador antes de volver a facturar.`,
        409,
        "DGII_REJECTED"
      );
    }

    if (usage.status === "RESERVED" && usage.attempts > 0) {
      const existing = await lookupInMSeller(tenantId, usage.eNcf);

      if (existing) {
        await applyMSellerResult(usage, existing);
        return { usage, result: existing, alreadySent: false, environment };
      }

      if (sequence && sequence.expirationDate < todayInDR()) {
        await voidFiscalNumber(usage, "La secuencia venció antes del envío");
        continue;
      }
    }

    const payload = buildPayload({ eNcf: usage.eNcf, sequence });

    // Se registra el intento antes de enviar: si el proceso se cae
    // a mitad, el próximo intento verificará con MSeller primero
    await usage.update({
      attempts: usage.attempts + 1,
      lastAttemptAt: new Date(),
      lastError: null,
    });

    let result;

    try {
      result = await sendECFToMSeller(tenantId, payload, sendOptions);
    } catch (error) {
      const message = extractErrorMessage(error);

      // Un conflicto suele indicar que MSeller ya tiene este e-NCF
      if (error?.response?.status === 409) {
        const existing = await lookupInMSeller(tenantId, usage.eNcf).catch(() => null);

        if (existing) {
          await applyMSellerResult(usage, existing);
          return { usage, result: existing, alreadySent: false, environment };
        }
      }

      if (classifySendError(error) === "uncertain") {
        await usage.update({ lastError: message });

        throw new FiscalNumberError(
          `No se recibió confirmación de MSeller para el e-NCF ${usage.eNcf}. Vuelve a intentarlo: antes de reenviar se verificará si ya fue recibido.`,
          503,
          "MSELLER_UNCERTAIN"
        );
      }

      await usage.update({ status: "FAILED", lastError: message });

      throw new FiscalNumberError(
        `MSeller no aceptó el comprobante: ${message}`,
        502,
        "MSELLER_FAILED"
      );
    }

    const returnedNumber = result?.ecf || result?.ncf;

    if (returnedNumber && returnedNumber !== usage.eNcf) {
      console.warn(
        `ECF NUMBER MISMATCH tenant=${tenantId} expected=${usage.eNcf} received=${returnedNumber}`
      );
    }

    await applyMSellerResult(usage, result);

    return { usage, result, alreadySent: false, environment };
  }

  throw new FiscalNumberError(
    "No se pudo asignar un e-NCF válido. Revisa tus rangos en Facturación → Numeración.",
    409,
    "NO_FISCAL_NUMBERS"
  );
};

const markDocumentFailure = async (document, error) => {
  const status =
    error?.code === "MSELLER_UNCERTAIN" || error?.code === "MSELLER_UNVERIFIED"
      ? "Pendiente"
      : "Error";

  // Un documento ya aceptado no debe perder su estado por un error posterior
  if (document.eNcf && document.dgiiQrUrl) return;

  await document.update({ electronicInvoiceStatus: status }).catch(() => null);
};

const persistInvoiceResult = async ({ invoice, usage, result, environment }) => {
  const displayStatus = getDisplayStatus(usage, result);

  const electronicInvoiceValues = {
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    environment,
    documentType: result?.documentType || null,
    eNcf: usage.eNcf,
    internalTrackId: result?.internalTrackId || null,
    securityCode: result?.securityCode || null,
    qrUrl: result?.qr_url || null,
    signedDate: result?.signedDate || null,
    status: displayStatus,
    dgiiResponse: result?.dgiiResponse || null,
    rawResponse: result || null,
  };

  const existing = await ElectronicInvoice.findOne({
    where: { invoiceId: invoice.id, tenantId: invoice.tenantId },
  });

  let electronicInvoice;

  if (existing) {
    // No borrar datos ya recibidos si la consulta trae menos campos
    const updates = Object.fromEntries(
      Object.entries(electronicInvoiceValues).filter(
        ([, value]) => value !== null && value !== undefined
      )
    );
    electronicInvoice = await existing.update(updates);
  } else {
    electronicInvoice = await ElectronicInvoice.create(electronicInvoiceValues);
  }

  await invoice.update({
    eNcf: usage.eNcf,
    tipoeCF: usage.tipoECF,
    dgiiQrUrl: electronicInvoice.qrUrl || invoice.dgiiQrUrl,
    electronicInvoiceStatus: displayStatus,
  });

  return electronicInvoice;
};

export const emitInvoiceECF = async ({ tenantId, userId, invoiceId }) => {
  const tenant = await getEmissionTenant(tenantId);

  const invoice = await Invoice.findOne({
    where: { id: invoiceId, tenantId },
    include: [
      {
        model: InvoiceItem,
        as: "items",
        where: { tenantId },
        required: false,
      },
    ],
  });

  if (!invoice) throw new FiscalNumberError("Factura no encontrada.", 404);

  if (invoice.status === "draft") {
    throw new FiscalNumberError("No puedes emitir e-CF de una factura en borrador.");
  }

  if (invoice.status === "cancelled") {
    throw new FiscalNumberError("No puedes emitir e-CF de una factura anulada.");
  }

  const items = invoice.items || [];

  if (!items.length) {
    throw new FiscalNumberError("La factura no tiene productos.");
  }

  const priorUsage = await getActiveFiscalUsage(tenantId, "invoice", invoice.id);

  // Facturas emitidas antes de la numeración por rangos
  if (!priorUsage && invoice.eNcf) {
    throw new FiscalNumberError(
      `Esta factura ya tiene el e-NCF ${invoice.eNcf}.`,
      409,
      "DOCUMENT_HAS_NUMBER"
    );
  }

  const tipoECF = invoice.invoiceType === "credit_fiscal" ? "31" : "32";

  try {
    validateBuyer({
      tipoECF,
      customerRnc: invoice.customerRnc,
      customerName: invoice.customerName,
      total: invoice.total,
    });

    const { usage, result, environment } = await emitFiscalDocument({
      tenantId,
      userId,
      documentType: "invoice",
      documentId: invoice.id,
      tipoECF,
      buildPayload: ({ eNcf, sequence }) =>
        buildInvoicePayload({ invoice, tenant, items, tipoECF, eNcf, sequence }),
    });

    const electronicInvoice = await persistInvoiceResult({
      invoice,
      usage,
      result,
      environment,
    });

    return { invoice, electronicInvoice, usage, response: result };
  } catch (error) {
    await markDocumentFailure(invoice, error);
    throw error;
  }
};

export const emitPosSaleECF = async ({ tenantId, userId, saleId }) => {
  const tenant = await getEmissionTenant(tenantId);

  const sale = await PosSale.findOne({
    where: { id: saleId, tenantId },
    include: [{ model: PosSaleItem, as: "items" }],
  });

  if (!sale) throw new FiscalNumberError("Venta no encontrada.", 404);

  const items = sale.items || [];

  if (!items.length) {
    throw new FiscalNumberError("La venta no tiene productos.");
  }

  const priorUsage = await getActiveFiscalUsage(tenantId, "pos_sale", sale.id);

  if (!priorUsage && sale.eNcf) {
    throw new FiscalNumberError(
      `Esta venta ya tiene el e-NCF ${sale.eNcf}.`,
      409,
      "DOCUMENT_HAS_NUMBER"
    );
  }

  const tipoECF = sale.receiptType === "credit_fiscal" ? "31" : "32";

  try {
    validateBuyer({
      tipoECF,
      customerRnc: sale.customerRnc,
      customerName: sale.customerName,
      total: sale.total,
    });

    const document = preparePosSaleDocument(sale, items);

    const { usage, result } = await emitFiscalDocument({
      tenantId,
      userId,
      documentType: "pos_sale",
      documentId: sale.id,
      tipoECF,
      // En caja no se puede esperar tanto; si no responde queda pendiente
      sendOptions: { timeout: POS_SEND_TIMEOUT_MS },
      buildPayload: ({ eNcf, sequence }) =>
        buildPosSalePayload({ sale, tenant, document, tipoECF, eNcf, sequence }),
    });

    await sale.update({
      eNcf: usage.eNcf,
      tipoeCF: usage.tipoECF,
      dgiiQrUrl: result?.qr_url || sale.dgiiQrUrl,
      securityCode: result?.securityCode || sale.securityCode,
      signedDate: result?.signedDate || sale.signedDate,
      electronicInvoiceStatus: getDisplayStatus(usage, result),
    });

    return { sale, usage, response: result };
  } catch (error) {
    await markDocumentFailure(sale, error);
    throw error;
  }
};

/*
 * Consulta el estado en MSeller y lo guarda en el número y la factura.
 */
export const syncInvoiceECFStatus = async ({ tenantId, electronicInvoice }) => {
  const usage = await getActiveFiscalUsage(
    tenantId,
    "invoice",
    electronicInvoice.invoiceId
  );

  const result = await getECFStatusFromMSeller(tenantId, electronicInvoice.eNcf);

  if (usage && usage.eNcf === electronicInvoice.eNcf && hasDocumentData(result)) {
    await applyMSellerResult(usage, result);
  }

  const displayStatus = result?.status || electronicInvoice.status;

  await electronicInvoice.update({
    status: displayStatus,
    dgiiResponse: result?.dgiiResponse || electronicInvoice.dgiiResponse,
    rawResponse: result,
    qrUrl: result?.qr_url || electronicInvoice.qrUrl,
    securityCode: result?.securityCode || electronicInvoice.securityCode,
    signedDate: result?.signedDate || electronicInvoice.signedDate,
  });

  const invoice = await Invoice.findOne({
    where: { id: electronicInvoice.invoiceId, tenantId },
  });

  if (invoice) {
    await invoice.update({
      electronicInvoiceStatus: displayStatus,
      dgiiQrUrl: electronicInvoice.qrUrl || invoice.dgiiQrUrl,
    });
  }

  return { electronicInvoice, response: result };
};
