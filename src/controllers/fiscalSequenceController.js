import { TenantMSellerCredential } from "../models/index.js";
import {
  ECF_ENVIRONMENTS,
  ECF_ENVIRONMENT_LABELS,
  ECF_TYPES,
  createFiscalSequence,
  deleteFiscalSequence,
  getFiscalSequenceOverview,
  importFiscalSequences,
  setFiscalSequenceEnabled,
  updateFiscalSequenceExpiration,
} from "../services/fiscalSequenceService.js";
import { logActivity } from "../utils/activityLogger.js";

const sendError = (res, error, logLabel, fallbackMessage) => {
  if (error.name === "FiscalNumberError") {
    return res.status(error.statusCode || 400).json({
      message: error.message,
      code: error.code,
    });
  }

  console.log(logLabel, error);
  return res.status(500).json({ message: fallbackMessage });
};

/*
 * Los números se registran en el entorno en que emite la empresa.
 * Sin cuenta de MSeller configurada todavía, se asumen de producción,
 * que es lo que entrega la DGII al contribuyente.
 */
const getTenantEnvironment = async (tenantId) => {
  const credential = await TenantMSellerCredential.findOne({
    where: { tenantId, isActive: true },
    attributes: ["environment"],
  });

  return credential?.environment || "eCF";
};

const ACTION_LABELS = {
  CREATE_FISCAL_SEQUENCE: "registró",
  IMPORT_FISCAL_SEQUENCES: "importó desde archivo",
  ENABLE_FISCAL_SEQUENCE: "activó",
  DISABLE_FISCAL_SEQUENCE: "desactivó",
  UPDATE_FISCAL_SEQUENCE_EXPIRATION: "cambió el vencimiento de",
  DELETE_FISCAL_SEQUENCE: "eliminó",
};

const log = (req, action, sequence, extra = {}) =>
  logActivity({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    module: "fiscal_sequences",
    action,
    description: `${req.user.email} ${ACTION_LABELS[action]} el rango e-NCF #${sequence?.id}`,
    metadata: {
      sequenceId: sequence?.id,
      environment: sequence?.environment,
      tipoECF: sequence?.tipoECF,
      rangeStart: sequence?.rangeStart,
      rangeEnd: sequence?.rangeEnd,
      ...extra,
    },
  });

export const getFiscalSequences = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const [overview, credential] = await Promise.all([
      getFiscalSequenceOverview(tenantId),
      TenantMSellerCredential.findOne({
        where: { tenantId, isActive: true },
        attributes: ["environment"],
      }),
    ]);

    return res.json({
      ...overview,
      currentEnvironment: credential?.environment || null,
      registerEnvironment: credential?.environment || "eCF",
      types: ECF_TYPES,
      environments: ECF_ENVIRONMENTS.map((value) => ({
        value,
        label: ECF_ENVIRONMENT_LABELS[value],
      })),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "GET FISCAL SEQUENCES ERROR:",
      "No se pudieron consultar los rangos de e-NCF"
    );
  }
};

export const createFiscalSequenceHandler = async (req, res) => {
  try {
    const sequence = await createFiscalSequence({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      tipoECF: req.body.tipoECF,
      environment: await getTenantEnvironment(req.user.tenantId),
      start: req.body.start,
      end: req.body.end,
      expirationDate: req.body.expirationDate,
    });

    await log(req, "CREATE_FISCAL_SEQUENCE", sequence);

    return res.status(201).json({
      message: "Rango registrado correctamente",
      sequence,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "CREATE FISCAL SEQUENCE ERROR:",
      "No se pudo registrar el rango"
    );
  }
};

export const importFiscalSequencesHandler = async (req, res) => {
  try {
    const dryRun = req.body.dryRun === true;

    const result = await importFiscalSequences({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      environment: await getTenantEnvironment(req.user.tenantId),
      ranges: req.body.ranges,
      dryRun,
    });

    if (!dryRun) {
      const created = result.ranges.filter((item) => item.id);

      await logActivity({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        module: "fiscal_sequences",
        action: "IMPORT_FISCAL_SEQUENCES",
        description: `${req.user.email} ${ACTION_LABELS.IMPORT_FISCAL_SEQUENCES} ${created.length} rango(s) e-NCF`,
        metadata: {
          environment: result.environment,
          fileName: String(req.body.fileName || "").slice(0, 255),
          newNumbers: result.newNumbers,
          ranges: created.map((item) => ({
            sequenceId: item.id,
            tipoECF: item.tipoECF,
            rangeStart: item.rangeStart,
            rangeEnd: item.rangeEnd,
            expirationDate: item.expirationDate,
          })),
        },
      });
    }

    return res.status(dryRun ? 200 : 201).json({
      message: dryRun ? "Archivo analizado" : "Números registrados correctamente",
      ...result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "IMPORT FISCAL SEQUENCES ERROR:",
      "No se pudieron registrar los números del archivo"
    );
  }
};

export const updateFiscalSequenceStatus = async (req, res) => {
  try {
    const enabled = req.body.enabled === true;

    const sequence = await setFiscalSequenceEnabled({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      id: req.params.id,
      enabled,
    });

    await log(req, enabled ? "ENABLE_FISCAL_SEQUENCE" : "DISABLE_FISCAL_SEQUENCE", sequence);

    return res.json({
      message: enabled ? "Rango activado" : "Rango desactivado",
      sequence,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "UPDATE FISCAL SEQUENCE STATUS ERROR:",
      "No se pudo actualizar el rango"
    );
  }
};

export const updateFiscalSequenceExpirationHandler = async (req, res) => {
  try {
    const sequence = await updateFiscalSequenceExpiration({
      tenantId: req.user.tenantId,
      id: req.params.id,
      expirationDate: req.body.expirationDate,
    });

    await log(req, "UPDATE_FISCAL_SEQUENCE_EXPIRATION", sequence, {
      expirationDate: sequence.expirationDate,
    });

    return res.json({
      message: "Fecha de vencimiento actualizada",
      sequence,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "UPDATE FISCAL SEQUENCE EXPIRATION ERROR:",
      "No se pudo actualizar la fecha"
    );
  }
};

export const deleteFiscalSequenceHandler = async (req, res) => {
  try {
    await deleteFiscalSequence({
      tenantId: req.user.tenantId,
      id: req.params.id,
    });

    await log(req, "DELETE_FISCAL_SEQUENCE", { id: Number(req.params.id) });

    return res.json({ message: "Rango eliminado" });
  } catch (error) {
    return sendError(
      res,
      error,
      "DELETE FISCAL SEQUENCE ERROR:",
      "No se pudo eliminar el rango"
    );
  }
};
