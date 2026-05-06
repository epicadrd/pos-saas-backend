import { Invoice, Receipt, sequelize } from "../models/index.js";

const generateReceiptNumber = async (tenantId) => {
  const count = await Receipt.count({
    where: { tenantId },
  });

  return `REC-${String(count + 1).padStart(6, "0")}`;
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

    if (!customerName) {
      await transaction.rollback();
      return res.status(400).json({
        message: "El cliente es obligatorio",
      });
    }

    if (!amount || Number(amount) <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "El monto debe ser mayor a 0",
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
      });

      if (!invoice) {
        await transaction.rollback();
        return res.status(404).json({
          message: "Factura no encontrada",
        });
      }

      const currentBalance = Number(invoice.balance || invoice.total || 0);

      if (Number(amount) > currentBalance) {
        await transaction.rollback();
        return res.status(400).json({
          message: "El monto no puede ser mayor al balance pendiente",
        });
      }
    }

    const receiptNumber = await generateReceiptNumber(tenantId);

    const receipt = await Receipt.create(
      {
        tenantId,
        invoiceId: invoiceId || null,
        receiptNumber,
        customerName,
        concept: concept || "Pago de factura",
        amount: Number(amount),
        paymentMethod: paymentMethod || "cash",
        reference,
        notes,
        status,
      },
      { transaction }
    );

    if (invoice && status === "paid") {
      const paidAmount = Number(invoice.paidAmount || 0) + Number(amount);
      const balance = Number(invoice.total || 0) - paidAmount;

      await invoice.update(
        {
          paidAmount,
          balance: balance < 0 ? 0 : balance,
          status: balance <= 0 ? "paid" : "partial",
        },
        { transaction }
      );
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
    await transaction.rollback();
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
    });

    if (!receipt) {
      await transaction.rollback();
      return res.status(404).json({
        message: "Recibo no encontrado",
      });
    }

    if (receipt.invoiceId && receipt.status === "paid") {
      const invoice = await Invoice.findOne({
        where: {
          id: receipt.invoiceId,
          tenantId,
        },
        transaction,
      });

      if (invoice) {
        const paidAmount = Number(invoice.paidAmount || 0) - Number(receipt.amount);
        const safePaid = paidAmount < 0 ? 0 : paidAmount;
        const balance = Number(invoice.total || 0) - safePaid;

        await invoice.update(
          {
            paidAmount: safePaid,
            balance,
            status: safePaid <= 0 ? "draft" : balance <= 0 ? "paid" : "partial",
          },
          { transaction }
        );
      }
    }

    await receipt.destroy({ transaction });

    await transaction.commit();

    return res.json({
      message: "Recibo eliminado correctamente",
    });
  } catch (error) {
    await transaction.rollback();
    console.log("DELETE RECEIPT ERROR:", error);
    return res.status(500).json({
      message: "Error eliminando recibo",
    });
  }
};