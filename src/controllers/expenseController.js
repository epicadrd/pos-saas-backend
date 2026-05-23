import { Op, fn, col } from "sequelize";
import { Expense } from "../models/index.js";
import { logActivity } from "../utils/activityLogger.js";

const money = (value) => Number(value || 0);

const buildExpenseNumber = async (tenantId) => {
  const count = await Expense.count({ where: { tenantId } });
  return `GAS-${String(count + 1).padStart(6, "0")}`;
};

const normalizeAmounts = ({ subtotal, tax, total }) => {
  const cleanSubtotal = money(subtotal);
  const cleanTax = money(tax);
  const cleanTotal =
    total !== undefined && total !== null && total !== ""
      ? money(total)
      : cleanSubtotal + cleanTax;

  return {
    subtotal: cleanSubtotal,
    tax: cleanTax,
    total: cleanTotal,
  };
};

export const getExpenses = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { search = "", category = "", status = "", from = "", to = "" } = req.query;

    const where = { tenantId };

    if (category) where.category = category;
    if (status) where.status = status;

    if (from || to) {
      where.expenseDate = {};
      if (from) where.expenseDate[Op.gte] = from;
      if (to) where.expenseDate[Op.lte] = to;
    }

    if (search) {
      where[Op.or] = [
        { expenseNumber: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { supplierName: { [Op.like]: `%${search}%` } },
        { category: { [Op.like]: `%${search}%` } },
      ];
    }

    const expenses = await Expense.findAll({
      where,
      order: [
        ["expenseDate", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    res.json(expenses);
  } catch (error) {
    console.log("GET EXPENSES ERROR:", error);
    res.status(500).json({ message: "Error obteniendo gastos" });
  }
};

export const createExpense = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const {
      category,
      description,
      supplierName,
      supplierRnc,
      expenseDate,
      paymentMethod,
      status,
      notes,
    } = req.body;

    if (!category?.trim()) {
      return res.status(400).json({ message: "La categoría es obligatoria" });
    }

    if (!description?.trim()) {
      return res.status(400).json({ message: "La descripción es obligatoria" });
    }

    if (!expenseDate) {
      return res.status(400).json({ message: "La fecha es obligatoria" });
    }

    const amounts = normalizeAmounts(req.body);

    if (amounts.total <= 0) {
      return res.status(400).json({ message: "El total debe ser mayor que cero" });
    }

    const expense = await Expense.create({
      tenantId,
      expenseNumber: await buildExpenseNumber(tenantId),
      category: category.trim(),
      description: description.trim(),
      supplierName,
      supplierRnc,
      expenseDate,
      paymentMethod: paymentMethod || "cash",
      status: status || "paid",
      notes,
      ...amounts,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    await logActivity({
      tenantId,
      userId: req.user.id,
      module: "gastos",
      action: "create",
      description: `Registró el gasto ${expense.expenseNumber} por RD$${expense.total}`,
      metadata: { expenseId: expense.id },
    });

    res.status(201).json(expense);
  } catch (error) {
    console.log("CREATE EXPENSE ERROR:", error);
    res.status(500).json({ message: "Error creando gasto" });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const expense = await Expense.findOne({
      where: {
        id: req.params.id,
        tenantId,
      },
    });

    if (!expense) {
      return res.status(404).json({ message: "Gasto no encontrado" });
    }

    const payload = {
      ...req.body,
      updatedBy: req.user.id,
    };

    if (
      req.body.subtotal !== undefined ||
      req.body.tax !== undefined ||
      req.body.total !== undefined
    ) {
      Object.assign(
        payload,
        normalizeAmounts({
          subtotal: req.body.subtotal ?? expense.subtotal,
          tax: req.body.tax ?? expense.tax,
          total: req.body.total ?? expense.total,
        })
      );
    }

    await expense.update(payload);

    await logActivity({
      tenantId,
      userId: req.user.id,
      module: "gastos",
      action: "update",
      description: `Actualizó el gasto ${expense.expenseNumber}`,
      metadata: { expenseId: expense.id },
    });

    res.json(expense);
  } catch (error) {
    console.log("UPDATE EXPENSE ERROR:", error);
    res.status(500).json({ message: "Error actualizando gasto" });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const expense = await Expense.findOne({
      where: {
        id: req.params.id,
        tenantId,
      },
    });

    if (!expense) {
      return res.status(404).json({ message: "Gasto no encontrado" });
    }

    await expense.destroy();

    await logActivity({
      tenantId,
      userId: req.user.id,
      module: "gastos",
      action: "delete",
      description: `Eliminó el gasto ${expense.expenseNumber}`,
      metadata: { expenseId: expense.id },
    });

    res.json({ message: "Gasto eliminado" });
  } catch (error) {
    console.log("DELETE EXPENSE ERROR:", error);
    res.status(500).json({ message: "Error eliminando gasto" });
  }
};

export const getExpenseStats = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const [monthTotal, pendingTotal, byCategory] = await Promise.all([
      Expense.sum("total", {
        where: {
          tenantId,
          status: "paid",
          expenseDate: { [Op.gte]: start },
        },
      }),

      Expense.sum("total", {
        where: {
          tenantId,
          status: "pending",
        },
      }),

      Expense.findAll({
        where: {
          tenantId,
          status: { [Op.ne]: "cancelled" },
          expenseDate: { [Op.gte]: start },
        },
        attributes: ["category", [fn("SUM", col("total")), "total"]],
        group: ["category"],
        raw: true,
      }),
    ]);

    res.json({
      monthTotal: money(monthTotal),
      pendingTotal: money(pendingTotal),
      byCategory,
    });
  } catch (error) {
    console.log("EXPENSE STATS ERROR:", error);
    res.status(500).json({ message: "Error cargando estadísticas de gastos" });
  }
};