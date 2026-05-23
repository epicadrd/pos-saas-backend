import { Op, fn, col, literal } from "sequelize";
import { Invoice, Receipt, PurchaseOrder, Expense } from "../models/index.js";

const money = (value) => Number(value || 0);

const startOfMonth = () => {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const sevenDaysAgo = () => {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const getAccountingSummary = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const activeInvoiceStatuses = ["issued", "partial", "paid"];

    const [
      incomeMonth,
      collectedMonth,
      accountsReceivable,
      overdueReceivable,
      accountsPayable,
      openInvoices,
      openPurchaseOrders,
      cashFlowTrend,
      recentReceipts,
      expensesMonth,
    ] = await Promise.all([
      Invoice.sum("total", {
        where: {
          tenantId,
          status: { [Op.in]: activeInvoiceStatuses },
          createdAt: { [Op.gte]: startOfMonth() },
        },
      }),

      Receipt.sum("amount", {
        where: {
          tenantId,
          status: "paid",
          createdAt: { [Op.gte]: startOfMonth() },
        },
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
          dueDate: { [Op.lt]: new Date() },
        },
      }),

      PurchaseOrder.sum("total", {
        where: {
          tenantId,
          status: { [Op.in]: ["sent", "received"] },
        },
      }),

      Invoice.count({
        where: {
          tenantId,
          status: { [Op.in]: ["issued", "partial"] },
          balance: { [Op.gt]: 0 },
        },
      }),

      PurchaseOrder.count({
        where: {
          tenantId,
          status: { [Op.in]: ["sent", "received"] },
        },
      }),

      Receipt.findAll({
        where: {
          tenantId,
          status: "paid",
          createdAt: { [Op.gte]: sevenDaysAgo() },
        },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [fn("SUM", col("amount")), "total"],
        ],
        group: [literal("DATE(createdAt)")],
        order: [[literal("DATE(createdAt)"), "ASC"]],
        raw: true,
      }),

      Receipt.findAll({
        where: {
          tenantId,
          status: "paid",
        },
        order: [["createdAt", "DESC"]],
        limit: 5,
        attributes: [
          "id",
          "receiptNumber",
          "customerName",
          "amount",
          "paymentMethod",
          "createdAt",
        ],
      }),

      Expense.sum("total", {
        where: {
          tenantId,
          status: "paid",
          expenseDate: { [Op.gte]: startOfMonth() },
        },
      }),
    ]);

    const cleanExpensesMonth = money(expensesMonth);
    const netProfit = money(collectedMonth) - cleanExpensesMonth;

    return res.json({
      summary: {
        incomeMonth: money(incomeMonth),
        collectedMonth: money(collectedMonth),
        expensesMonth: cleanExpensesMonth,
        netProfit,
        accountsReceivable: money(accountsReceivable),
        overdueReceivable: money(overdueReceivable),
        accountsPayable: money(accountsPayable),
        openInvoices,
        openPurchaseOrders,
      },
      cashFlowTrend: cashFlowTrend.map((item) => ({
        date: item.date,
        total: money(item.total),
      })),
      recentReceipts,
    });
  } catch (error) {
    console.log("ACCOUNTING SUMMARY ERROR:", error);
    return res.status(500).json({
      message: "Error cargando resumen contable",
    });
  }
};