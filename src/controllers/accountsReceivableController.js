import { Op, fn, col, literal } from "sequelize";
import { Invoice, Receipt } from "../models/index.js";

const money = (value) => Number(value || 0);

const todayDateOnly = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDaysOverdue = (dueDate) => {
  if (!dueDate) return 0;

  const today = todayDateOnly();
  const due = new Date(`${dueDate}T00:00:00`);
  const diff = today - due;

  if (diff <= 0) return 0;

  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export const getAccountsReceivable = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const {
      search = "",
      status = "",
      aging = "",
      from = "",
      to = "",
    } = req.query;

    const where = {
      tenantId,
      status: {
        [Op.in]: ["issued", "partial"],
      },
      balance: {
        [Op.gt]: 0,
      },
    };

    if (status) {
      where.status = status;
    }

    if (from || to) {
      where.invoiceDate = {};

      if (from) where.invoiceDate[Op.gte] = from;
      if (to) where.invoiceDate[Op.lte] = to;
    }

    if (aging === "overdue") {
      where.dueDate = {
        [Op.lt]: todayDateOnly(),
      };
    }

    if (aging === "current") {
      where[Op.or] = [
        { dueDate: null },
        { dueDate: { [Op.gte]: todayDateOnly() } },
      ];
    }

    if (search) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        {
          [Op.or]: [
            { invoiceNumber: { [Op.like]: `%${search}%` } },
            { customerName: { [Op.like]: `%${search}%` } },
            { customerRnc: { [Op.like]: `%${search}%` } },
            { customerPhone: { [Op.like]: `%${search}%` } },
            { customerEmail: { [Op.like]: `%${search}%` } },
          ],
        },
      ];
    }

    const [
      invoices,
      totalReceivable,
      overdueReceivable,
      openInvoices,
      partialInvoices,
      currentReceivable,
      collectionByDay,
      recentReceipts,
    ] = await Promise.all([
      Invoice.findAll({
        where,
        include: [
          {
            model: Receipt,
            as: "receipts",
            required: false,
            where: {
              tenantId,
              status: "paid",
            },
            attributes: [
              "id",
              "receiptNumber",
              "amount",
              "paymentMethod",
              "createdAt",
            ],
          },
        ],
        order: [
          ["dueDate", "ASC"],
          ["createdAt", "DESC"],
        ],
      }),

      Invoice.sum("balance", {
        where: {
          tenantId,
          status: { [Op.in]: ["issued", "partial"] },
          balance: { [Op.gt]: 0 },
        },
      }),

      Invoice.sum("balance", {
        where: {
          tenantId,
          status: { [Op.in]: ["issued", "partial"] },
          balance: { [Op.gt]: 0 },
          dueDate: { [Op.lt]: todayDateOnly() },
        },
      }),

      Invoice.count({
        where: {
          tenantId,
          status: { [Op.in]: ["issued", "partial"] },
          balance: { [Op.gt]: 0 },
        },
      }),

      Invoice.count({
        where: {
          tenantId,
          status: "partial",
          balance: { [Op.gt]: 0 },
        },
      }),

      Invoice.sum("balance", {
        where: {
          tenantId,
          status: { [Op.in]: ["issued", "partial"] },
          balance: { [Op.gt]: 0 },
          [Op.or]: [
            { dueDate: null },
            { dueDate: { [Op.gte]: todayDateOnly() } },
          ],
        },
      }),

      Receipt.findAll({
        where: {
          tenantId,
          status: "paid",
        },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [fn("SUM", col("amount")), "total"],
        ],
        group: [literal("DATE(createdAt)")],
        order: [[literal("DATE(createdAt)"), "ASC"]],
        limit: 30,
        raw: true,
      }),

      Receipt.findAll({
        where: {
          tenantId,
          status: "paid",
        },
        order: [["createdAt", "DESC"]],
        limit: 8,
        attributes: [
          "id",
          "receiptNumber",
          "customerName",
          "amount",
          "paymentMethod",
          "createdAt",
        ],
      }),
    ]);

    const rows = invoices.map((invoice) => {
      const plain = invoice.toJSON();

      return {
        ...plain,
        daysOverdue: getDaysOverdue(plain.dueDate),
        isOverdue: getDaysOverdue(plain.dueDate) > 0,
        paidPercent:
          money(plain.total) > 0
            ? Math.min((money(plain.amountPaid) / money(plain.total)) * 100, 100)
            : 0,
      };
    });

    return res.json({
      summary: {
        totalReceivable: money(totalReceivable),
        overdueReceivable: money(overdueReceivable),
        currentReceivable: money(currentReceivable),
        openInvoices,
        partialInvoices,
      },

      invoices: rows,

      collectionByDay: collectionByDay.map((item) => ({
        date: item.date,
        total: money(item.total),
      })),

      recentReceipts,
    });
  } catch (error) {
    console.log("ACCOUNTS RECEIVABLE ERROR:", error);

    return res.status(500).json({
      message: "Error cargando cuentas por cobrar",
    });
  }
};