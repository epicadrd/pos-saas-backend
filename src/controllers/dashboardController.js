import { Op, fn, col, literal } from "sequelize";
import {
  Invoice,
  Product,
  Quote,
  DeliveryNote,
  Receipt,
  PurchaseOrder,
  Customer,
  ActivityLog,
  User,
} from "../models/index.js";
import {
  sumInvoicesInDop,
  sumReceiptsInDop,
  sumInvoiceDopAttr,
} from "../utils/currencyAmounts.js";

const money = (value) => Number(value || 0);

const startOfDay = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = () => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
};

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

export const getDashboardSummary = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const activeInvoiceStatuses = ["issued", "partial", "paid"];

    const [
      salesToday,
      salesMonth,
      collectedToday,
      collectedMonth,
      pendingBalance,
      invoicesCount,
      pendingInvoices,
      productsCount,
      lowStockCount,
      customersCount,
      quotesPending,
      deliveryNotesOpen,
      purchaseOrdersOpen,
      receiptsCount,
      recentInvoices,
      lowStockProducts,
      recentActivities,
      salesTrend,
    ] = await Promise.all([
      sumInvoicesInDop(Invoice, "total", {
        where: {
          tenantId,
          status: { [Op.in]: activeInvoiceStatuses },
          createdAt: { [Op.between]: [startOfDay(), endOfDay()] },
        },
      }),

      sumInvoicesInDop(Invoice, "total", {
        where: {
          tenantId,
          status: { [Op.in]: activeInvoiceStatuses },
          createdAt: { [Op.gte]: startOfMonth() },
        },
      }),

      sumReceiptsInDop(Receipt, {
        where: {
          tenantId,
          status: "paid",
          createdAt: { [Op.between]: [startOfDay(), endOfDay()] },
        },
      }),

      sumReceiptsInDop(Receipt, {
        where: {
          tenantId,
          status: "paid",
          createdAt: { [Op.gte]: startOfMonth() },
        },
      }),

      sumInvoicesInDop(Invoice, "balance", {
        where: {
          tenantId,
          status: { [Op.in]: ["issued", "partial"] },
        },
      }),

      Invoice.count({
        where: {
          tenantId,
          status: { [Op.ne]: "cancelled" },
        },
      }),

      Invoice.count({
        where: {
          tenantId,
          status: { [Op.in]: ["issued", "partial"] },
          balance: { [Op.gt]: 0 },
        },
      }),

      Product.count({
        where: {
          tenantId,
          isActive: true,
        },
      }),

      Product.count({
        where: {
          tenantId,
          isActive: true,
          productType: "product",
          trackStock: true,
          stock: { [Op.lte]: col("minStock") },
        },
      }),

      Customer.count({
        where: {
          tenantId,
          isActive: true,
        },
      }),

      Quote.count({
        where: {
          tenantId,
          status: { [Op.in]: ["draft", "sent", "approved"] },
        },
      }),

      DeliveryNote.count({
        where: {
          tenantId,
          status: { [Op.in]: ["draft", "issued"] },
        },
      }),

      PurchaseOrder.count({
        where: {
          tenantId,
          status: { [Op.in]: ["draft", "sent"] },
        },
      }),

      Receipt.count({
        where: {
          tenantId,
          status: "paid",
        },
      }),

      Invoice.findAll({
        where: { tenantId },
        order: [["createdAt", "DESC"]],
        limit: 5,
        attributes: [
          "id",
          "invoiceNumber",
          "customerName",
          "total",
          "balance",
          "status",
          "currency",
          "exchangeRate",
          "createdAt",
        ],
      }),

      Product.findAll({
        where: {
          tenantId,
          isActive: true,
          productType: "product",
          trackStock: true,
          stock: { [Op.lte]: col("minStock") },
        },
        order: [
          ["stock", "ASC"],
          ["name", "ASC"],
        ],
        limit: 5,
        attributes: ["id", "name", "sku", "stock", "minStock"],
      }),

      ActivityLog.findAll({
        where: { tenantId },
        order: [["createdAt", "DESC"]],
        limit: 6,
        include: [
          {
            model: User,
            as: "user",
            attributes: ["name", "email"],
            required: false,
          },
        ],
      }),

      Invoice.findAll({
        where: {
          tenantId,
          status: { [Op.in]: activeInvoiceStatuses },
          createdAt: { [Op.gte]: sevenDaysAgo() },
        },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [sumInvoiceDopAttr("total"), "total"],
        ],
        group: [literal("DATE(createdAt)")],
        order: [[literal("DATE(createdAt)"), "ASC"]],
        raw: true,
      }),
    ]);

    return res.json({
      summary: {
        salesToday: money(salesToday),
        salesMonth: money(salesMonth),
        collectedToday: money(collectedToday),
        collectedMonth: money(collectedMonth),
        pendingBalance: money(pendingBalance),
        invoicesCount,
        pendingInvoices,
        productsCount,
        lowStockCount,
        customersCount,
        quotesPending,
        deliveryNotesOpen,
        purchaseOrdersOpen,
        receiptsCount,
      },
      recentInvoices,
      lowStockProducts,
      recentActivities,
      salesTrend: salesTrend.map((item) => ({
        date: item.date,
        total: money(item.total),
      })),
    });
  } catch (error) {
    console.error("Error cargando dashboard:", error);
    return res.status(500).json({
      message: "Error cargando datos del dashboard",
    });
  }
};