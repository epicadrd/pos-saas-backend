import { Op, fn, col, literal } from "sequelize";
import {
  Invoice,
  Receipt,
  Expense,
  Product,
  InvoiceItem,
  Supplier,
} from "../models/index.js";

const money = (value) => Number(value || 0);

const getDateRange = (from, to) => {
  const start = from ? new Date(`${from}T00:00:00`) : new Date();
  const end = to ? new Date(`${to}T23:59:59`) : new Date();

  if (!from) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  if (!to) {
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
};

export const getReportsOverview = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = req.query;

    const { start, end } = getDateRange(from, to);

    const activeInvoiceStatuses = ["issued", "partial", "paid"];

    const [
      totalSales,
      totalCollected,
      totalExpenses,
      accountsReceivable,
      paidExpenses,
      pendingExpenses,
      invoicesCount,
      receiptsCount,
      expensesCount,
      salesByDay,
      expensesByCategory,
      expensesBySupplier,
      recentInvoices,
      recentExpenses,
      lowStockProducts,
      topProducts,
    ] = await Promise.all([
      Invoice.sum("total", {
        where: {
          tenantId,
          status: { [Op.in]: activeInvoiceStatuses },
          createdAt: { [Op.between]: [start, end] },
        },
      }),

      Receipt.sum("amount", {
        where: {
          tenantId,
          status: "paid",
          createdAt: { [Op.between]: [start, end] },
        },
      }),

      Expense.sum("total", {
        where: {
          tenantId,
          status: { [Op.ne]: "cancelled" },
          expenseDate: {
            [Op.between]: [
              start.toISOString().slice(0, 10),
              end.toISOString().slice(0, 10),
            ],
          },
        },
      }),

      Invoice.sum("balance", {
        where: {
          tenantId,
          status: { [Op.in]: ["issued", "partial"] },
          balance: { [Op.gt]: 0 },
        },
      }),

      Expense.sum("total", {
        where: {
          tenantId,
          status: "paid",
          expenseDate: {
            [Op.between]: [
              start.toISOString().slice(0, 10),
              end.toISOString().slice(0, 10),
            ],
          },
        },
      }),

      Expense.sum("total", {
        where: {
          tenantId,
          status: "pending",
        },
      }),

      Invoice.count({
        where: {
          tenantId,
          status: { [Op.in]: activeInvoiceStatuses },
          createdAt: { [Op.between]: [start, end] },
        },
      }),

      Receipt.count({
        where: {
          tenantId,
          status: "paid",
          createdAt: { [Op.between]: [start, end] },
        },
      }),

      Expense.count({
        where: {
          tenantId,
          status: { [Op.ne]: "cancelled" },
          expenseDate: {
            [Op.between]: [
              start.toISOString().slice(0, 10),
              end.toISOString().slice(0, 10),
            ],
          },
        },
      }),

      Invoice.findAll({
        where: {
          tenantId,
          status: { [Op.in]: activeInvoiceStatuses },
          createdAt: { [Op.between]: [start, end] },
        },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [fn("SUM", col("total")), "total"],
        ],
        group: [literal("DATE(createdAt)")],
        order: [[literal("DATE(createdAt)"), "ASC"]],
        raw: true,
      }),

      Expense.findAll({
        where: {
          tenantId,
          status: { [Op.ne]: "cancelled" },
          expenseDate: {
            [Op.between]: [
              start.toISOString().slice(0, 10),
              end.toISOString().slice(0, 10),
            ],
          },
        },
        attributes: ["category", [fn("SUM", col("total")), "total"]],
        group: ["category"],
        order: [[literal("total"), "DESC"]],
        raw: true,
      }),

      Expense.findAll({
        where: {
          tenantId,
          status: { [Op.ne]: "cancelled" },
          supplierId: { [Op.ne]: null },
          expenseDate: {
            [Op.between]: [
              start.toISOString().slice(0, 10),
              end.toISOString().slice(0, 10),
            ],
          },
        },
        include: [
          {
            model: Supplier,
            as: "supplier",
            attributes: [],
            required: false,
          },
        ],
        attributes: [
          "supplierId",
          [col("supplier.name"), "supplierName"],
          [fn("SUM", col("Expense.total")), "total"],
        ],
        group: ["Expense.supplierId", "supplier.id", "supplier.name"],
        order: [[literal("total"), "DESC"]],
        raw: true,
      }),

      Invoice.findAll({
        where: {
          tenantId,
          status: { [Op.in]: activeInvoiceStatuses },
          createdAt: { [Op.between]: [start, end] },
        },
        order: [["createdAt", "DESC"]],
        limit: 8,
        attributes: [
          "id",
          "invoiceNumber",
          "customerName",
          "total",
          "balance",
          "status",
          "createdAt",
        ],
      }),

      Expense.findAll({
        where: {
          tenantId,
          status: { [Op.ne]: "cancelled" },
          expenseDate: {
            [Op.between]: [
              start.toISOString().slice(0, 10),
              end.toISOString().slice(0, 10),
            ],
          },
        },
        order: [["expenseDate", "DESC"]],
        limit: 8,
        attributes: [
          "id",
          "expenseNumber",
          "category",
          "description",
          "supplierName",
          "total",
          "status",
          "expenseDate",
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
        limit: 8,
        attributes: ["id", "name", "sku", "stock", "minStock"],
      }),

      InvoiceItem.findAll({
        where: {
          tenantId,
        },
        include: [
          {
            model: Invoice,
            required: true,
            attributes: [],
            where: {
              tenantId,
              status: { [Op.in]: activeInvoiceStatuses },
              createdAt: { [Op.between]: [start, end] },
            },
          },
        ],
        attributes: [
          "productName",
          [fn("SUM", col("quantity")), "quantity"],
          [fn("SUM", col("InvoiceItem.total")), "total"],
        ],
        group: ["productName"],
        order: [[literal("total"), "DESC"]],
        limit: 8,
        raw: true,
      }),
    ]);

    const cleanSales = money(totalSales);
    const cleanCollected = money(totalCollected);
    const cleanExpenses = money(totalExpenses);

    return res.json({
      range: {
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      },

      summary: {
        totalSales: cleanSales,
        totalCollected: cleanCollected,
        totalExpenses: cleanExpenses,
        netProfit: cleanCollected - cleanExpenses,
        accountsReceivable: money(accountsReceivable),
        paidExpenses: money(paidExpenses),
        pendingExpenses: money(pendingExpenses),
        invoicesCount,
        receiptsCount,
        expensesCount,
      },

      charts: {
        salesByDay: salesByDay.map((item) => ({
          date: item.date,
          total: money(item.total),
        })),

        expensesByCategory: expensesByCategory.map((item) => ({
          category: item.category || "Sin categoría",
          total: money(item.total),
        })),

        expensesBySupplier: expensesBySupplier.map((item) => ({
          supplierId: item.supplierId,
          supplierName: item.supplierName || "Sin proveedor",
          total: money(item.total),
        })),

        topProducts: topProducts.map((item) => ({
          productName: item.productName,
          quantity: Number(item.quantity || 0),
          total: money(item.total),
        })),
      },

      tables: {
        recentInvoices,
        recentExpenses,
        lowStockProducts,
      },
    });
  } catch (error) {
    console.log("REPORTS OVERVIEW ERROR:", error);

    return res.status(500).json({
      message: "Error cargando reportes",
    });
  }
};