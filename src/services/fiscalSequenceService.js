import { Op } from "sequelize";
import {
  sequelize,
  Tenant,
  Invoice,
  PosSale,
  FiscalSequence,
  FiscalNumberUsage,
} from "../models/index.js";

export const ECF_ENVIRONMENTS = ["TesteCF", "CerteCF", "eCF"];

export const ECF_ENVIRONMENT_LABELS = {
  TesteCF: "Pruebas (TesteCF)",
  CerteCF: "Certificación (CerteCF)",
  eCF: "Producción (eCF)",
};

export const ECF_TYPES = {
  31: "Factura de Crédito Fiscal",
  32: "Factura de Consumo",
  33: "Nota de Débito",
  34: "Nota de Crédito",
  41: "Compras",
  43: "Gastos Menores",
  44: "Regímenes Especiales",
  45: "Gubernamental",
  46: "Exportaciones",
  47: "Pagos al Exterior",
};

// El e-NCF es E + tipo (2) + secuencia (10)
export const MAX_SEQUENCE_NUMBER = 9999999999;

const DOCUMENT_MODELS = {
  invoice: Invoice,
  pos_sale: PosSale,
};

export class FiscalNumberError extends Error {
  constructor(message, statusCode = 400, code = null) {
    super(message);
    this.name = "FiscalNumberError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const formatENcf = (tipoECF, number) =>
  `E${tipoECF}${String(number).padStart(10, "0")}`;

// Fecha de hoy en República Dominicana, sin depender de la zona del servidor
export const todayInDR = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

// "2026-12-31" → "31-12-2026", formato de fechas de la DGII
export const dateOnlyToDGII = (value) => {
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}-${month}-${year}`;
};

export const isValidDateOnly = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/*
 * Acepta el e-NCF completo ("E310000000001") o solo la secuencia
 * ("1", "0000000001"). Ignora espacios y guiones.
 */
export const parseSequenceInput = (value, tipoECF) => {
  const clean = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");

  if (/^E\d{12}$/.test(clean)) {
    if (clean.slice(1, 3) !== tipoECF) {
      throw new FiscalNumberError(
        `El e-NCF ${clean} no corresponde al tipo ${tipoECF}.`
      );
    }

    return Number(clean.slice(3));
  }

  if (/^\d{1,10}$/.test(clean)) return Number(clean);

  throw new FiscalNumberError(
    `"${value}" no es un e-NCF válido. Usa el formato E${tipoECF}0000000001.`
  );
};

const isDeadlock = (error) =>
  error?.parent?.code === "ER_LOCK_DEADLOCK" ||
  error?.parent?.code === "ER_LOCK_WAIT_TIMEOUT";

// MySQL puede abortar una transacción por interbloqueo; se repite completa
const withDeadlockRetry = async (operation, attempts = 3) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isDeadlock(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
};

const describeRange = (sequence) =>
  `${formatENcf(sequence.tipoECF, sequence.rangeStart)} – ${formatENcf(
    sequence.tipoECF,
    sequence.rangeEnd
  )}`;

// Valida un rango antes de guardarlo; devuelve los números ya convertidos
const normalizeRange = ({ tipoECF, start, end, expirationDate }) => {
  const type = String(tipoECF || "").trim();

  if (!ECF_TYPES[type]) {
    throw new FiscalNumberError("Selecciona un tipo de e-CF válido.");
  }

  const rangeStart = parseSequenceInput(start, type);
  const rangeEnd = parseSequenceInput(end, type);

  if (rangeStart < 1) {
    throw new FiscalNumberError("La secuencia inicial debe ser mayor que cero.");
  }

  if (rangeEnd > MAX_SEQUENCE_NUMBER) {
    throw new FiscalNumberError("La secuencia final excede el máximo permitido.");
  }

  if (rangeStart > rangeEnd) {
    throw new FiscalNumberError(
      "El número inicial no puede ser mayor que el número final."
    );
  }

  if (!isValidDateOnly(expirationDate)) {
    throw new FiscalNumberError("La fecha de vencimiento no es válida.");
  }

  if (expirationDate < todayInDR()) {
    throw new FiscalNumberError(
      "La fecha de vencimiento ya pasó. Verifica la fecha que aprobó la DGII."
    );
  }

  return { tipoECF: type, rangeStart, rangeEnd, expirationDate };
};

const assertEnvironment = (environment) => {
  const env = String(environment || "").trim();

  if (!ECF_ENVIRONMENTS.includes(env)) {
    throw new FiscalNumberError("Selecciona un entorno válido.");
  }

  return env;
};

// Bloquear la empresa evita que dos registros simultáneos se solapen
const lockTenant = (tenantId, transaction) =>
  Tenant.findOne({
    where: { id: tenantId },
    attributes: ["id"],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

const findOverlapping = (tenantId, environment, range, transaction) =>
  FiscalSequence.findAll({
    where: {
      tenantId,
      environment,
      tipoECF: range.tipoECF,
      rangeStart: { [Op.lte]: range.rangeEnd },
      rangeEnd: { [Op.gte]: range.rangeStart },
    },
    order: [["rangeStart", "ASC"]],
    transaction,
  });

export const createFiscalSequence = async ({
  tenantId,
  userId,
  tipoECF,
  environment,
  start,
  end,
  expirationDate,
}) => {
  const env = assertEnvironment(environment);
  const range = normalizeRange({ tipoECF, start, end, expirationDate });

  return sequelize.transaction(async (transaction) => {
    await lockTenant(tenantId, transaction);

    const [overlapping] = await findOverlapping(tenantId, env, range, transaction);

    if (overlapping) {
      throw new FiscalNumberError(
        `Este rango se cruza con uno ya registrado (${describeRange(
          overlapping
        )}). Un mismo número no puede registrarse dos veces.`,
        409,
        "RANGE_OVERLAP"
      );
    }

    return FiscalSequence.create(
      {
        tenantId,
        environment: env,
        ...range,
        nextNumber: range.rangeStart,
        status: "active",
        createdBy: userId || null,
      },
      { transaction }
    );
  });
};

export const MAX_IMPORT_RANGES = 1000;

/*
 * Registra de una vez los rangos que salen del archivo de la DGII.
 * Todo o nada: si un rango tiene un error no se guarda ninguno.
 * Los rangos que ya estaban registrados completos se omiten, así
 * subir el mismo archivo dos veces no duplica ni falla.
 * Con dryRun solo se analiza, para mostrar el resumen antes de confirmar.
 */
export const importFiscalSequences = async ({
  tenantId,
  userId,
  environment,
  ranges,
  dryRun = false,
}) => {
  const env = assertEnvironment(environment);

  if (!Array.isArray(ranges) || !ranges.length) {
    throw new FiscalNumberError("El archivo no tiene números e-NCF para registrar.");
  }

  if (ranges.length > MAX_IMPORT_RANGES) {
    throw new FiscalNumberError(
      `El archivo tiene demasiados rangos separados (${ranges.length}). Divide el archivo e inténtalo de nuevo.`
    );
  }

  const normalized = ranges.map((input, index) => {
    try {
      return normalizeRange(input);
    } catch (error) {
      if (error.name !== "FiscalNumberError") throw error;
      throw new FiscalNumberError(`Rango ${index + 1} del archivo: ${error.message}`);
    }
  });

  // Dentro del mismo archivo un número no puede aparecer en dos rangos
  const sorted = [...normalized].sort(
    (a, b) => a.tipoECF.localeCompare(b.tipoECF) || a.rangeStart - b.rangeStart
  );

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const current = sorted[i];

    if (prev.tipoECF === current.tipoECF && current.rangeStart <= prev.rangeEnd) {
      throw new FiscalNumberError(
        `El archivo repite los números ${describeRange(
          current
        )} en dos rangos distintos. Revisa el archivo.`
      );
    }
  }

  const run = async (transaction) => {
    await lockTenant(tenantId, transaction);

    const results = [];

    for (const range of sorted) {
      const overlapping = await findOverlapping(tenantId, env, range, transaction);
      const total = range.rangeEnd - range.rangeStart + 1;

      // Los rangos guardados no se solapan entre sí, así que sumar las
      // intersecciones dice cuántos números de este rango ya existen
      const covered = overlapping.reduce(
        (acc, seq) =>
          acc +
          Math.min(Number(seq.rangeEnd), range.rangeEnd) -
          Math.max(Number(seq.rangeStart), range.rangeStart) +
          1,
        0
      );

      if (overlapping.length && covered < total) {
        throw new FiscalNumberError(
          `Los números ${describeRange(range)} se cruzan en parte con un rango ya registrado (${describeRange(
            overlapping[0]
          )}). Revisa el archivo o elimina el rango anterior si estaba mal.`,
          409,
          "RANGE_OVERLAP"
        );
      }

      results.push({
        ...range,
        startENcf: formatENcf(range.tipoECF, range.rangeStart),
        endENcf: formatENcf(range.tipoECF, range.rangeEnd),
        total,
        alreadyRegistered: covered === total,
      });
    }

    if (!dryRun) {
      for (const result of results.filter((item) => !item.alreadyRegistered)) {
        const sequence = await FiscalSequence.create(
          {
            tenantId,
            environment: env,
            tipoECF: result.tipoECF,
            rangeStart: result.rangeStart,
            rangeEnd: result.rangeEnd,
            nextNumber: result.rangeStart,
            expirationDate: result.expirationDate,
            status: "active",
            createdBy: userId || null,
          },
          { transaction }
        );

        result.id = sequence.id;
      }
    }

    return {
      environment: env,
      ranges: results,
      newNumbers: results
        .filter((item) => !item.alreadyRegistered)
        .reduce((acc, item) => acc + item.total, 0),
    };
  };

  if (!dryRun) return sequelize.transaction(run);

  // El análisis usa los mismos bloqueos, pero nunca guarda nada
  const transaction = await sequelize.transaction();

  try {
    return await run(transaction);
  } finally {
    await transaction.rollback();
  }
};

export const voidFiscalNumber = async (usage, reason, transaction) =>
  usage.update(
    {
      status: "VOIDED",
      voidReason: String(reason || "").slice(0, 255),
      resolvedAt: new Date(),
    },
    { transaction }
  );

/*
 * Devuelve el e-NCF del documento. Si ya tiene uno lo reutiliza:
 * un reintento nunca consume un número nuevo. Solo se asigna otro
 * cuando el anterior quedó anulado (VOIDED).
 */
export const reserveFiscalNumber = async ({
  tenantId,
  environment,
  tipoECF,
  documentType,
  documentId,
  userId,
}) => {
  const DocumentModel = DOCUMENT_MODELS[documentType];

  if (!DocumentModel) {
    throw new FiscalNumberError("Tipo de documento no soportado.");
  }

  return withDeadlockRetry(() => sequelize.transaction(async (transaction) => {
    // Las reservas de una empresa se hacen una a la vez: la fila de la
    // empresa es el único punto de bloqueo y evita interbloqueos
    await Tenant.findOne({
      where: { id: tenantId },
      attributes: ["id"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const document = await DocumentModel.findOne({
      where: { id: documentId, tenantId },
      attributes: ["id"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!document) {
      throw new FiscalNumberError("Documento no encontrado.", 404);
    }

    const today = todayInDR();

    const existing = await FiscalNumberUsage.findOne({
      where: {
        tenantId,
        documentType,
        documentId,
        status: { [Op.ne]: "VOIDED" },
      },
      order: [["id", "DESC"]],
      transaction,
    });

    if (existing) {
      const neverReachedMSeller =
        existing.status === "FAILED" ||
        (existing.status === "RESERVED" && existing.attempts === 0);

      if (existing.environment !== environment || existing.tipoECF !== tipoECF) {
        if (!neverReachedMSeller) {
          throw new FiscalNumberError(
            `Este documento ya tiene el e-NCF ${existing.eNcf} (${existing.environment}). No se le puede asignar otro.`,
            409,
            "DOCUMENT_HAS_NUMBER"
          );
        }

        await voidFiscalNumber(
          existing,
          existing.environment !== environment
            ? "Cambio de entorno antes del envío"
            : "Cambio de tipo de comprobante antes del envío",
          transaction
        );
      } else {
        const sequence = await FiscalSequence.findByPk(existing.sequenceId, {
          transaction,
        });

        const expired = !sequence || sequence.expirationDate < today;

        if (!(expired && neverReachedMSeller)) {
          return { usage: existing, sequence, reused: true };
        }

        await voidFiscalNumber(
          existing,
          "La secuencia venció antes del envío",
          transaction
        );
      }
    }

    const sequences = await FiscalSequence.findAll({
      where: {
        tenantId,
        environment,
        tipoECF,
        status: "active",
        expirationDate: { [Op.gte]: today },
      },
      order: [["rangeStart", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    for (const sequence of sequences) {
      let next = Number(sequence.nextNumber);
      const end = Number(sequence.rangeEnd);

      // Salta números que ya figuran como usados (defensa ante datos inconsistentes)
      while (next <= end) {
        const taken = await FiscalNumberUsage.findOne({
          where: { tenantId, environment, eNcf: formatENcf(tipoECF, next) },
          attributes: ["id"],
          transaction,
        });

        if (!taken) break;
        next += 1;
      }

      if (next > end) {
        await sequence.update(
          { nextNumber: end + 1, status: "exhausted" },
          { transaction }
        );
        continue;
      }

      await sequence.update(
        {
          nextNumber: next + 1,
          status: next + 1 > end ? "exhausted" : "active",
        },
        { transaction }
      );

      const usage = await FiscalNumberUsage.create(
        {
          tenantId,
          sequenceId: sequence.id,
          environment,
          tipoECF,
          eNcf: formatENcf(tipoECF, next),
          documentType,
          documentId,
          status: "RESERVED",
          userId: userId || null,
          reservedAt: new Date(),
        },
        { transaction }
      );

      return { usage, sequence, reused: false };
    }

    throw new FiscalNumberError(
      `No tienes números e-NCF tipo ${tipoECF} (${ECF_TYPES[tipoECF] || ""}) disponibles en ${
        ECF_ENVIRONMENT_LABELS[environment] || environment
      }. Registra el rango que te autorizó la DGII en Facturación → Numeración.`,
      409,
      "NO_FISCAL_NUMBERS"
    );
  }));
};

const remainingInSequence = (sequence) =>
  Math.max(0, Number(sequence.rangeEnd) - Number(sequence.nextNumber) + 1);

const INCIDENT_STALE_MINUTES = 15;

export const getFiscalSequenceOverview = async (tenantId) => {
  const today = todayInDR();

  const sequences = await FiscalSequence.findAll({
    where: { tenantId },
    order: [
      ["environment", "ASC"],
      ["tipoECF", "ASC"],
      ["rangeStart", "ASC"],
    ],
  });

  const usageCounts = await FiscalNumberUsage.findAll({
    where: { tenantId },
    attributes: [
      "sequenceId",
      "status",
      [sequelize.fn("COUNT", sequelize.col("id")), "total"],
    ],
    group: ["sequenceId", "status"],
    raw: true,
  });

  const countsBySequence = {};
  for (const row of usageCounts) {
    countsBySequence[row.sequenceId] ||= {};
    countsBySequence[row.sequenceId][row.status] = Number(row.total);
  }

  const rows = sequences.map((sequence) => {
    const json = sequence.toJSON();
    const expired = json.expirationDate < today;
    const remaining = remainingInSequence(json);
    const usable = json.status === "active" && !expired && remaining > 0;

    return {
      ...json,
      rangeStart: Number(json.rangeStart),
      rangeEnd: Number(json.rangeEnd),
      nextNumber: Number(json.nextNumber),
      startENcf: formatENcf(json.tipoECF, json.rangeStart),
      endENcf: formatENcf(json.tipoECF, json.rangeEnd),
      nextENcf: remaining > 0 ? formatENcf(json.tipoECF, json.nextNumber) : null,
      total: Number(json.rangeEnd) - Number(json.rangeStart) + 1,
      used: Number(json.nextNumber) - Number(json.rangeStart),
      remaining,
      expired,
      usable,
      // Números que ya no se usarán y deben anularse ante la DGII
      unusedToAnnul: usable ? 0 : remaining,
      usageByStatus: countsBySequence[json.id] || {},
      canDelete: Number(json.nextNumber) === Number(json.rangeStart) &&
        !countsBySequence[json.id],
    };
  });

  const staleBefore = new Date(Date.now() - INCIDENT_STALE_MINUTES * 60 * 1000);

  const incidents = await FiscalNumberUsage.findAll({
    where: {
      tenantId,
      [Op.or]: [
        { status: { [Op.in]: ["FAILED", "REJECTED", "VOIDED"] } },
        { status: "RESERVED", attempts: { [Op.gt]: 0 } },
        { status: "RESERVED", reservedAt: { [Op.lt]: staleBefore } },
        { status: "SENT", msellerStatus: { [Op.in]: ["Error", "No encontrado"] } },
      ],
    },
    order: [["updatedAt", "DESC"]],
    limit: 100,
  });

  const invoiceIds = incidents
    .filter((usage) => usage.documentType === "invoice")
    .map((usage) => usage.documentId);
  const saleIds = incidents
    .filter((usage) => usage.documentType === "pos_sale")
    .map((usage) => usage.documentId);

  const [invoices, sales] = await Promise.all([
    invoiceIds.length
      ? Invoice.findAll({
          where: { tenantId, id: { [Op.in]: invoiceIds } },
          attributes: ["id", "invoiceNumber", "customerName", "status"],
        })
      : [],
    saleIds.length
      ? PosSale.findAll({
          where: { tenantId, id: { [Op.in]: saleIds } },
          attributes: ["id", "saleNumber", "customerName"],
        })
      : [],
  ]);

  const invoiceById = new Map(invoices.map((row) => [row.id, row]));
  const saleById = new Map(sales.map((row) => [row.id, row]));

  return {
    today,
    sequences: rows,
    incidents: incidents.map((usage) => {
      const { msellerStatus, ...json } = usage.toJSON();
      const document =
        json.documentType === "invoice"
          ? invoiceById.get(json.documentId)
          : saleById.get(json.documentId);

      return {
        ...json,
        dgiiStatus: msellerStatus,
        documentNumber:
          document?.invoiceNumber || document?.saleNumber || `#${json.documentId}`,
        customerName: document?.customerName || null,
      };
    }),
  };
};

const findTenantSequence = async (tenantId, id, transaction) => {
  const sequence = await FiscalSequence.findOne({
    where: { id, tenantId },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!sequence) {
    throw new FiscalNumberError("Rango no encontrado.", 404);
  }

  return sequence;
};

export const setFiscalSequenceEnabled = async ({
  tenantId,
  userId,
  id,
  enabled,
}) =>
  sequelize.transaction(async (transaction) => {
    const sequence = await findTenantSequence(tenantId, id, transaction);

    if (!enabled) {
      if (sequence.status === "disabled") return sequence;

      return sequence.update(
        { status: "disabled", disabledBy: userId || null, disabledAt: new Date() },
        { transaction }
      );
    }

    if (sequence.status !== "disabled") return sequence;

    return sequence.update(
      {
        status: remainingInSequence(sequence) > 0 ? "active" : "exhausted",
        disabledBy: null,
        disabledAt: null,
      },
      { transaction }
    );
  });

export const updateFiscalSequenceExpiration = async ({
  tenantId,
  id,
  expirationDate,
}) => {
  if (!isValidDateOnly(expirationDate)) {
    throw new FiscalNumberError("La fecha de vencimiento no es válida.");
  }

  if (expirationDate < todayInDR()) {
    throw new FiscalNumberError(
      "La fecha de vencimiento no puede estar en el pasado. Si el rango ya no sirve, desactívalo."
    );
  }

  return sequelize.transaction(async (transaction) => {
    const sequence = await findTenantSequence(tenantId, id, transaction);
    return sequence.update({ expirationDate }, { transaction });
  });
};

export const deleteFiscalSequence = async ({ tenantId, id }) =>
  sequelize.transaction(async (transaction) => {
    const sequence = await findTenantSequence(tenantId, id, transaction);

    const usages = await FiscalNumberUsage.count({
      where: { tenantId, sequenceId: sequence.id },
      transaction,
    });

    if (usages > 0 || Number(sequence.nextNumber) !== Number(sequence.rangeStart)) {
      throw new FiscalNumberError(
        "Este rango ya tiene números usados y no se puede eliminar. Puedes desactivarlo.",
        409
      );
    }

    await sequence.destroy({ transaction });
  });
