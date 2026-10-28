import { Op } from "sequelize";
import {
  sequelize,
  FiscalNote,
  Invoice,
  InvoiceItem,
} from "../models/index.js";
import {
  NOTE_ECF_TYPES,
  emitFiscalNoteECF,
  getActiveFiscalUsage,
} from "../services/ecfEmissionService.js";
import { todayInDR } from "../services/fiscalSequenceService.js";
import { returnInvoiceStock } from "./invoiceController.js";
import { logActivity } from "../utils/activityLogger.js";
import { sanitizeString, sanitizeNumber } from "../utils/sanitize.js";

const VALID_CODES = { credit: ["1", "3"], debit: ["3"] };
const ITBIS_RATES = [0, 16, 18];

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

class FiscalNoteError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Las notas que fallaron o la DGII rechazó no cuentan contra la factura
const countsAgainstInvoice = (note) =>
  !/^(error|rechazado|anulado)/i.test(String(note.electronicInvoiceStatus || ""));

const buildLine = ({ productName, quantity, unitPrice, discount = 0, taxRate }) => {
  const subtotal = roundMoney(quantity * unitPrice - discount);
  const tax = roundMoney((subtotal * taxRate) / 100);

  return {
    productName,
    quantity,
    unitPrice: roundMoney(unitPrice),
    discount: roundMoney(discount),
    subtotal,
    taxRate,
    tax,
    total: roundMoney(subtotal + tax),
  };
};

const copyInvoiceLines = (items) =>
  items.map((item) =>
    buildLine({
      productName: item.productName || "Producto",
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount || 0),
      taxRate: item.isTaxable === false ? 0 : Number(item.taxRate || 0),
    })
  );

const parseRequestedLines = (items, { exemptOnly }) => {
  if (!Array.isArray(items) || !items.length) {
    throw new FiscalNoteError("Agrega al menos una línea a la nota.");
  }

  if (items.length > 100) {
    throw new FiscalNoteError("La nota no puede tener más de 100 líneas.");
  }

  return items.map((item, index) => {
    const productName = sanitizeString(item.productName, 80);
    const quantity = sanitizeNumber(item.quantity);
    const unitPrice = sanitizeNumber(item.unitPrice);
    const taxRate = Number(item.taxRate || 0);
    const label = `Línea ${index + 1}`;

    if (!productName) throw new FiscalNoteError(`${label}: escribe la descripción.`);
    if (!(quantity > 0)) throw new FiscalNoteError(`${label}: la cantidad debe ser mayor que cero.`);
    if (!(unitPrice > 0)) throw new FiscalNoteError(`${label}: el precio debe ser mayor que cero.`);
    if (!ITBIS_RATES.includes(taxRate)) {
      throw new FiscalNoteError(`${label}: el ITBIS debe ser 0%, 16% o 18%.`);
    }
    if (exemptOnly && taxRate !== 0) {
      throw new FiscalNoteError(
        `${label}: las notas de una factura de régimen especial van exentas de ITBIS.`
      );
    }

    return buildLine({ productName, quantity, unitPrice, taxRate });
  });
};

const toClientNote = (note) => {
  const data = typeof note.toJSON === "function" ? note.toJSON() : note;
  return data;
};

/*
 * Aplica la nota a la factura una sola vez, cuando la DGII la acepta:
 * la anulación total devuelve el inventario y anula la factura; una
 * nota de crédito parcial rebaja el saldo pendiente.
 */
const applyNoteToInvoice = async ({ note, userId }) => {
  if (note.appliedAt) return;

  const usage = await getActiveFiscalUsage(note.tenantId, "fiscal_note", note.id);
  if (usage?.status !== "ACCEPTED") return;

  const transaction = await sequelize.transaction();

  try {
    const invoice = await Invoice.findOne({
      where: { id: note.invoiceId, tenantId: note.tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (invoice && note.noteType === "credit") {
      if (note.modificationCode === "1") {
        if (invoice.status !== "cancelled") {
          await returnInvoiceStock({
            invoice,
            tenantId: note.tenantId,
            userId,
            reason: `Nota de crédito ${note.eNcf}`,
            transaction,
          });

          await invoice.update(
            { status: "cancelled", balance: 0, updatedBy: userId },
            { transaction }
          );
        }
      } else {
        const balance = Math.max(0, roundMoney(Number(invoice.balance) - Number(note.total)));
        await invoice.update(
          {
            balance,
            status: balance === 0 && invoice.status !== "cancelled" ? "paid" : invoice.status,
            updatedBy: userId,
          },
          { transaction }
        );
      }
    }

    await note.update({ appliedAt: new Date() }, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.log("APPLY FISCAL NOTE ERROR:", error);
  }
};

const emitAndApply = async ({ note, tenantId, userId }) => {
  try {
    await emitFiscalNoteECF({ tenantId, userId, noteId: note.id });
    await note.reload();
    await applyNoteToInvoice({ note, userId });
    await note.reload();
    return { ok: true };
  } catch (error) {
    await note.reload();
    return { ok: false, error };
  }
};

export const getFiscalNotes = async (req, res) => {
  try {
    const where = { tenantId: req.user.tenantId };
    const invoiceId = Number(req.query.invoiceId);

    if (invoiceId) where.invoiceId = invoiceId;

    const notes = await FiscalNote.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: 200,
    });

    return res.json(notes.map(toClientNote));
  } catch (error) {
    console.log("GET FISCAL NOTES ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo las notas" });
  }
};

export const createFiscalNote = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;

    const noteType = req.body.noteType === "debit" ? "debit" : "credit";
    const modificationCode = String(req.body.modificationCode || "");
    const reason = sanitizeString(req.body.reason, 255);

    if (!VALID_CODES[noteType].includes(modificationCode)) {
      throw new FiscalNoteError("Elige el motivo de la nota.");
    }

    if (!reason || reason.trim().length < 3) {
      throw new FiscalNoteError("Escribe la razón de la nota.");
    }

    const invoice = await Invoice.findOne({
      where: { id: req.body.invoiceId, tenantId },
      include: [{ model: InvoiceItem, as: "items", where: { tenantId }, required: false }],
    });

    if (!invoice) throw new FiscalNoteError("Factura no encontrada.", 404);

    if (invoice.status === "cancelled") {
      throw new FiscalNoteError("Esta factura ya está anulada.");
    }

    const usage = await getActiveFiscalUsage(tenantId, "invoice", invoice.id);

    if (!invoice.eNcf || !usage || !["SENT", "ACCEPTED"].includes(usage.status)) {
      throw new FiscalNoteError(
        "Solo se pueden hacer notas de facturas que ya se enviaron a la DGII. Si la factura no se envió, anúlala directamente."
      );
    }

    const exemptOnly = invoice.invoiceType === "special_regime";
    const lines =
      noteType === "credit" && modificationCode === "1"
        ? copyInvoiceLines(invoice.items || [])
        : parseRequestedLines(req.body.items, { exemptOnly });

    const subtotal = roundMoney(lines.reduce((acc, line) => acc + line.subtotal, 0));
    const tax = roundMoney(lines.reduce((acc, line) => acc + line.tax, 0));
    const total = roundMoney(subtotal + tax);

    if (total <= 0) throw new FiscalNoteError("La nota debe tener un monto mayor que cero.");

    if (noteType === "credit") {
      const previousNotes = await FiscalNote.findAll({
        where: { tenantId, invoiceId: invoice.id, noteType: "credit" },
      });
      const credited = roundMoney(
        previousNotes
          .filter(countsAgainstInvoice)
          .reduce((acc, note) => acc + Number(note.total), 0)
      );

      if (modificationCode === "1" && credited > 0) {
        throw new FiscalNoteError(
          "Esta factura ya tiene notas de crédito. Para devolver el resto usa una nota de corrección de montos."
        );
      }

      if (roundMoney(credited + total) > roundMoney(Number(invoice.total)) + 0.01) {
        throw new FiscalNoteError(
          `La nota supera lo que queda por acreditar de la factura (RD$ ${roundMoney(
            Number(invoice.total) - credited
          ).toFixed(2)}).`
        );
      }
    }

    const note = await FiscalNote.create({
      tenantId,
      invoiceId: invoice.id,
      noteType,
      modificationCode,
      reason: reason.trim(),
      referenceENcf: invoice.eNcf,
      referenceDate: invoice.invoiceDate || todayInDR(),
      customerName: invoice.customerName,
      customerRnc: invoice.customerRnc,
      lines,
      subtotal,
      tax,
      total,
      noteDate: todayInDR(),
      tipoeCF: NOTE_ECF_TYPES[noteType],
      electronicInvoiceStatus: "Pendiente",
      createdBy: userId,
    });

    await logActivity({
      tenantId,
      userId,
      module: "invoices",
      action: noteType === "credit" ? "CREATE_CREDIT_NOTE" : "CREATE_DEBIT_NOTE",
      description: `${req.user.email} creó una ${
        noteType === "credit" ? "nota de crédito" : "nota de débito"
      } de la factura ${invoice.invoiceNumber} (${invoice.eNcf})`,
      metadata: { noteId: note.id, invoiceId: invoice.id, total },
    }).catch(() => null);

    const result = await emitAndApply({ note, tenantId, userId });

    if (!result.ok) {
      return res.status(result.error?.statusCode || 400).json({
        message: `La nota se guardó, pero no se pudo enviar: ${String(
          result.error?.message || "error desconocido"
        ).replace(/\.+$/, "")}. Puedes reintentarla desde la factura.`,
        note: toClientNote(note),
      });
    }

    return res.status(201).json({
      message: "Nota enviada correctamente",
      note: toClientNote(note),
    });
  } catch (error) {
    console.log("CREATE FISCAL NOTE ERROR:", error);
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
};

export const retryFiscalNote = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const note = await FiscalNote.findOne({ where: { id: req.params.id, tenantId } });

    if (!note) return res.status(404).json({ message: "Nota no encontrada" });

    const result = await emitAndApply({ note, tenantId, userId: req.user?.id || null });

    if (!result.ok) {
      return res.status(result.error?.statusCode || 400).json({
        message: result.error?.message || "No se pudo enviar la nota",
        note: toClientNote(note),
      });
    }

    return res.json({ message: "Nota enviada correctamente", note: toClientNote(note) });
  } catch (error) {
    console.log("RETRY FISCAL NOTE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

// Ajusta la factura de las notas que se confirmaron después (consulta automática)
export const applyPendingFiscalNotes = async () => {
  const notes = await FiscalNote.findAll({
    where: {
      appliedAt: null,
      eNcf: { [Op.ne]: null },
      createdAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    limit: 50,
  });

  for (const note of notes) {
    await applyNoteToInvoice({ note, userId: note.createdBy });
  }
};
