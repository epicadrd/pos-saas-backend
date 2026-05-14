import { Invoice, Receipt, sequelize, User } from "../models/index.js";

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const generateReceiptNumber = async (tenantId, transaction) => {
  const count = await Receipt.count({
    where: { tenantId },
    transaction,
  });

  return `REC-${String(count + 1).padStart(6, "0")}`;
};

const recalculateInvoicePaymentStatus = async ({ invoice, transaction }) => {
  const paidReceipts = await Receipt.findAll({
    where: {
      invoiceId: invoice.id,
      tenantId: invoice.tenantId,
      status: "paid",
    },
    transaction,
  });

  const amountPaid = paidReceipts.reduce(
    (acc, receipt) => acc + toNumber(receipt.amount),
    0
  );

  const total = toNumber(invoice.total);
  const balance = Math.max(total - amountPaid, 0);

  let status = "issued";

  if (balance <= 0 && total > 0) {
    status = "paid";
  } else if (amountPaid > 0) {
    status = "partial";
  }

  await invoice.update(
    {
      amountPaid,
      balance,
      status,
    },
    { transaction }
  );
};

export const getReceipts = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const receipts = await Receipt.findAll({
      where: { tenantId },
      include: [
        {
          model: Invoice,
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email", "role"],
        },
        {
          model: User,
          as: "updater",
          attributes: ["id", "name", "email", "role"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json(receipts);
  } catch (error) {
    console.log("GET RECEIPTS ERROR:", error);
    return res.status(500).json({
      message: "Error obteniendo recibos",
    });
  }
};

export const createReceipt = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;

    const {
      invoiceId,
      customerName,
      concept,
      amount,
      paymentMethod,
      reference,
      notes,
      status = "paid",
    } = req.body;

    const cleanAmount = toNumber(amount);

    if (!customerName?.trim()) {
      await transaction.rollback();
      return res.status(400).json({
        message: "El cliente es obligatorio",
      });
    }

    if (cleanAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "El monto debe ser mayor a 0",
      });
    }

    if (!["paid", "cancelled"].includes(status)) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Estado de recibo inválido",
      });
    }

    let invoice = null;

    if (invoiceId) {
      invoice = await Invoice.findOne({
        where: {
          id: invoiceId,
          tenantId,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!invoice) {
        await transaction.rollback();
        return res.status(404).json({
          message: "Factura no encontrada",
        });
      }

      if (invoice.status === "cancelled") {
        await transaction.rollback();
        return res.status(400).json({
          message: "No puedes registrar pagos a una factura anulada",
        });
      }

        const currentBalance = toNumber(
          invoice.balance !== null && invoice.balance !== undefined
            ? invoice.balance
            : invoice.total
        );

        if (invoice.status === "paid" || currentBalance <= 0) {
          await transaction.rollback();
          return res.status(400).json({
            message: "Esta factura ya está pagada",
          });
        }

        if (status === "paid" && cleanAmount > currentBalance) {
          await transaction.rollback();
          return res.status(400).json({
            message: "El monto no puede ser mayor al balance pendiente",
          });
        }
    }

    const receiptNumber = await generateReceiptNumber(tenantId, transaction);

    const receipt = await Receipt.create(
      {
        tenantId,
        invoiceId: invoiceId || null,
        receiptNumber,
        customerName: customerName.trim(),
        concept: concept || "Pago de factura",
        amount: cleanAmount,
        paymentMethod: paymentMethod || "cash",
        reference,
        notes,
        status,
        createdBy: userId,
        updatedBy: userId,
      },
      { transaction }
    );

    if (invoice && status === "paid") {
      await recalculateInvoicePaymentStatus({
        invoice,
        transaction,
      });
    }

    await transaction.commit();

    const createdReceipt = await Receipt.findByPk(receipt.id, {
      include: [{ model: Invoice }],
    });

    return res.status(201).json({
      message: "Recibo creado correctamente",
      receipt: createdReceipt,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();

    console.log("CREATE RECEIPT ERROR:", error);
    return res.status(500).json({
      message: "Error creando recibo",
    });
  }
};

export const deleteReceipt = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const receipt = await Receipt.findOne({
      where: { id, tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!receipt) {
      await transaction.rollback();
      return res.status(404).json({
        message: "Recibo no encontrado",
      });
    }

    let invoice = null;

    if (receipt.invoiceId && receipt.status === "paid") {
      invoice = await Invoice.findOne({
        where: {
          id: receipt.invoiceId,
          tenantId,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
    }

    await receipt.destroy({ transaction });

    if (invoice) {
      await recalculateInvoicePaymentStatus({
        invoice,
        transaction,
      });
    }

    await transaction.commit();

    return res.json({
      message: "Recibo eliminado correctamente",
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();

    console.log("DELETE RECEIPT ERROR:", error);
    return res.status(500).json({
      message: "Error eliminando recibo",
    });
  }
};