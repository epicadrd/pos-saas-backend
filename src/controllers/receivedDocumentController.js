import crypto from "crypto";
import { UniqueConstraintError } from "sequelize";
import {
  Expense,
  ReceivedDocument,
  TenantMSellerCredential,
} from "../models/index.js";
import { decryptCertificateValue } from "../utils/certificateEncryption.js";
import { todayInDR } from "../services/fiscalSequenceService.js";

const SIGNATURE_MAX_AGE_SECONDS = 300;

const verifySignature = (rawBody, header, secret) => {
  const fields = Object.fromEntries(
    String(header || "")
      .split(",")
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), part.slice(index + 1)];
      })
  );

  const age = Math.abs(Date.now() / 1000 - Number(fields.t));

  if (!fields.sha256 || !(age <= SIGNATURE_MAX_AGE_SECONDS)) return false;

  const expected = Buffer.from(
    crypto.createHmac("sha256", secret).update(`${fields.t}.${rawBody}`).digest("hex")
  );
  const received = Buffer.from(fields.sha256);

  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

// "31-12-2026" (a veces con hora) → "2026-12-31"
const dgiiDateToDateOnly = (value) => {
  const match = /^(\d{2})-(\d{2})-(\d{4})/.exec(String(value || ""));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const toAmount = (value) => Number(value) || 0;

// El XML de la DGII da un objeto con un solo ítem y un arreglo con varios
const firstItemName = (ecf) => {
  const items = ecf?.DetallesItems?.Item;
  const first = Array.isArray(items) ? items[0] : items;
  return String(first?.NombreItem || "").slice(0, 255) || null;
};

const parseIncomingInvoice = (event) => {
  const ecf = event.document?.ECF;
  const header = ecf?.Encabezado || {};
  const eNcf = String(header.IdDoc?.eNCF || event.eNCF || "").trim().toUpperCase();
  const supplierRnc = String(header.Emisor?.RNCEmisor || "").replace(/\D/g, "");

  if (!eNcf || !supplierRnc) return null;

  return {
    eNcf,
    tipoECF: String(header.IdDoc?.TipoeCF || eNcf.slice(1, 3)).slice(0, 2),
    supplierRnc,
    supplierName: String(header.Emisor?.RazonSocialEmisor || "").slice(0, 255) || null,
    description: firstItemName(ecf),
    issueDate: dgiiDateToDateOnly(header.Emisor?.FechaEmision) || todayInDR(),
    tax: toAmount(header.Totales?.TotalITBIS),
    total: toAmount(header.Totales?.MontoTotal),
    document: event.document,
  };
};

export const handleEcfWebhook = async (req, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const rawBody = req.body.toString("utf8");

    const credential = tenantId
      ? await TenantMSellerCredential.findOne({ where: { tenantId } })
      : null;

    if (!credential?.webhookSecretEncrypted) return res.sendStatus(401);

    const secret = decryptCertificateValue({
      encrypted: credential.webhookSecretEncrypted,
      iv: credential.webhookSecretIv,
      authTag: credential.webhookSecretAuthTag,
    }).toString("utf8");

    if (!verifySignature(rawBody, req.get("X-Ecf-Signature"), secret)) {
      return res.sendStatus(401);
    }

    const event = JSON.parse(rawBody);

    if (
      event.test ||
      event.eventType !== "INCOMING_INVOICE" ||
      event.environment !== credential.environment
    ) {
      return res.sendStatus(200);
    }

    const data = parseIncomingInvoice(event);

    if (!data) {
      console.log("ECF WEBHOOK: comprobante sin e-NCF o RNC", event.deliveryId);
      return res.sendStatus(200);
    }

    // Si ya se registró a mano como gasto, no vuelve a quedar pendiente
    const expense = await Expense.findOne({ where: { tenantId, ncf: data.eNcf } });

    await ReceivedDocument.create({
      ...data,
      tenantId,
      status: expense ? "registered" : "pending",
      expenseId: expense?.id || null,
    });

    return res.sendStatus(200);
  } catch (error) {
    // Las entregas pueden repetirse: el comprobante ya está guardado
    if (error instanceof UniqueConstraintError) return res.sendStatus(200);

    console.log("ECF WEBHOOK ERROR:", error);
    return res.sendStatus(500);
  }
};

export const getReceivedDocuments = async (req, res) => {
  try {
    const documents = await ReceivedDocument.findAll({
      where: { tenantId: req.user.tenantId, status: ["pending", "ignored"] },
      attributes: { exclude: ["document"] },
      order: [["issueDate", "DESC"], ["id", "DESC"]],
      limit: 500,
    });

    return res.json(documents);
  } catch (error) {
    console.log("GET RECEIVED DOCUMENTS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo los comprobantes recibidos" });
  }
};

export const setReceivedDocumentIgnored = async (req, res) => {
  try {
    const document = await ReceivedDocument.findOne({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });

    if (!document) return res.status(404).json({ message: "Comprobante no encontrado" });

    if (document.status === "registered") {
      return res.status(400).json({ message: "Este comprobante ya está registrado como gasto" });
    }

    await document.update({ status: req.body.ignored === true ? "ignored" : "pending" });

    return res.json({ message: "Comprobante actualizado" });
  } catch (error) {
    console.log("IGNORE RECEIVED DOCUMENT ERROR:", error);
    return res.status(500).json({ message: "Error actualizando el comprobante" });
  }
};
