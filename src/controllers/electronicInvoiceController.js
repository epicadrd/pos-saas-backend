import {
  Invoice,
  InvoiceItem,
  Tenant,
  ElectronicInvoice,
} from "../models/index.js";
import {
  sendECFToMSeller,
  getECFStatusFromMSeller,
  getMSellerEnvironment,
} from "../services/msellerService.js";

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const formatDateDDMMYYYY = (dateValue) => {
  const date = dateValue ? new Date(dateValue) : new Date();

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
};

const buildECFPayloadFromInvoice = ({ invoice, tenant, items, eNcf }) => {
  const tipoeCF = invoice.tipoeCF || "31";

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
        IdDoc: {
          TipoeCF: tipoeCF,
          eNCF: eNcf,
          FechaVencimientoSecuencia: "31-12-2028",
          IndicadorEnvioDiferido: "1",
          IndicadorMontoGravado: "0",
          TipoIngresos: "01",
          TipoPago: Number(invoice.balance || 0) > 0 ? "2" : "1",
          TotalPaginas: 1,
        },
        Emisor: {
          RNCEmisor: tenant.rnc,
          RazonSocialEmisor: tenant.legalName || tenant.businessName,
          DireccionEmisor: tenant.address || "Direccion no especificada",
          FechaEmision: formatDateDDMMYYYY(invoice.invoiceDate),
        },
        Comprador: {
          RNCComprador: invoice.customerRnc || "00000000000",
          RazonSocialComprador: invoice.customerName || "Consumidor Final",
        },
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

export const emitElectronicInvoice = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { id, tenantId },
      include: [{
        model: InvoiceItem,
        as: "items",
        where: { tenantId },
        required: false,
        }],
    });

    if (!invoice) {
      return res.status(404).json({ message: "Factura no encontrada" });
    }

    if (invoice.status === "draft") {
      return res.status(400).json({
        message: "No puedes emitir e-CF de una factura en borrador",
      });
    }

    const existing = await ElectronicInvoice.findOne({
      where: { invoiceId: invoice.id, tenantId },
    });

    if (existing) {
      return res.status(400).json({
        message: "Esta factura ya tiene un e-CF generado",
        electronicInvoice: existing,
      });
    }

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant?.rnc) {
      return res.status(400).json({
        message: "La empresa no tiene RNC configurado",
      });
    }

    const tipoeCF = req.body?.tipoeCF || "31";
    invoice.tipoeCF = tipoeCF;

    const eNcf =
    req.body?.eNcf ||
    `E${tipoeCF}${String(Date.now()).slice(-10)}`;

    const payload = buildECFPayloadFromInvoice({
      invoice,
      tenant,
      items: invoice.items || [],
      eNcf,
    });

    const result = await sendECFToMSeller(payload);

    const electronicInvoice = await ElectronicInvoice.create({
      tenantId,
      invoiceId: invoice.id,
      environment: getMSellerEnvironment(),
      documentType: result.documentType || null,
      eNcf: result.ecf || result.ncf || eNcf,
      internalTrackId: result.internalTrackId || null,
      securityCode: result.securityCode || null,
      qrUrl: result.qr_url || null,
      signedDate: result.signedDate || null,
      signedXml: result.signedXml || null,
      status: result.status || "Enviado",
      dgiiResponse: result.dgiiResponse || null,
      rawResponse: result,
    });

   await invoice.update({
    dgiiQrUrl: result.qr_url || null,
    eNcf: result.ecf || result.ncf || eNcf,
    tipoeCF,
    electronicInvoiceStatus: result.status || "Enviado",
    });

    return res.status(201).json({
      message: "e-CF enviado correctamente",
      electronicInvoice,
      response: result,
    });
  } catch (error) {
    console.log("EMIT ELECTRONIC INVOICE ERROR:", error.response?.data || error);
    return res.status(400).json({
      message: "Error emitiendo e-CF",
      error: error.response?.data || error.message,
    });
  }
};

export const syncElectronicInvoiceStatus = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const electronicInvoice = await ElectronicInvoice.findOne({
      where: { id, tenantId },
    });

    if (!electronicInvoice) {
      return res.status(404).json({
        message: "e-CF no encontrado",
      });
    }

    const result = await getECFStatusFromMSeller(electronicInvoice.eNcf);

    await electronicInvoice.update({
      status: result.status || electronicInvoice.status,
      dgiiResponse: result.dgiiResponse || electronicInvoice.dgiiResponse,
      rawResponse: result,
      qrUrl: result.qr_url || electronicInvoice.qrUrl,
      securityCode: result.securityCode || electronicInvoice.securityCode,
      signedDate: result.signedDate || electronicInvoice.signedDate,
    });

    const invoice = await Invoice.findByPk(
        electronicInvoice.invoiceId
        );

        if (invoice) {
        await invoice.update({
            electronicInvoiceStatus:
            result.status || electronicInvoice.status,
        });
    }

    return res.json({
      message: "Estado actualizado correctamente",
      electronicInvoice,
      response: result,
    });
  } catch (error) {
    console.log("SYNC ELECTRONIC INVOICE ERROR:", error.response?.data || error);
    return res.status(400).json({
      message: "Error consultando estado del e-CF",
      error: error.response?.data || error.message,
    });
  }
};