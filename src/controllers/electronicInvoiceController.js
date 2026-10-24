import { ElectronicInvoice } from "../models/index.js";
import {
  emitInvoiceECF,
  emitPosSaleECF,
  syncInvoiceECFStatus,
} from "../services/ecfEmissionService.js";

const sendEcfError = (res, error, logLabel, fallbackMessage) => {
  console.log(logLabel, error.response?.data || error);

  if (error.name === "FiscalNumberError") {
    return res.status(error.statusCode || 400).json({
      message: error.message,
      code: error.code,
    });
  }

  return res.status(400).json({
    message: fallbackMessage,
    error: error.response?.data || error.message,
  });
};

export const emitElectronicInvoice = async (req, res) => {
  try {
    const { invoice, electronicInvoice, response } = await emitInvoiceECF({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      invoiceId: req.params.id,
    });

    return res.status(201).json({
      message: "e-CF enviado correctamente",
      invoice,
      electronicInvoice,
      response,
    });
  } catch (error) {
    return sendEcfError(
      res,
      error,
      "EMIT ELECTRONIC INVOICE ERROR:",
      "Error emitiendo e-CF"
    );
  }
};

export const emitPosSaleElectronicInvoice = async (req, res) => {
  try {
    const { sale, response } = await emitPosSaleECF({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      saleId: req.params.id,
    });

    return res.status(201).json({
      message: "e-CF enviado correctamente",
      sale,
      response,
    });
  } catch (error) {
    return sendEcfError(
      res,
      error,
      "EMIT POS SALE ECF ERROR:",
      "Error emitiendo e-CF"
    );
  }
};

export const syncElectronicInvoiceStatus = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const electronicInvoice = await ElectronicInvoice.findOne({
      where: { id: req.params.id, tenantId },
    });

    if (!electronicInvoice) {
      return res.status(404).json({ message: "e-CF no encontrado" });
    }

    const result = await syncInvoiceECFStatus({ tenantId, electronicInvoice });

    return res.json({
      message: "Estado actualizado correctamente",
      ...result,
    });
  } catch (error) {
    return sendEcfError(
      res,
      error,
      "SYNC ELECTRONIC INVOICE ERROR:",
      "Error consultando estado del e-CF"
    );
  }
};
