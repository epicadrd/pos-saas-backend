import { Op } from "sequelize";
import { PurchaseOrder, Supplier } from "../models/index.js";

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

export const getAccountsPayable = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const {
      search = "",
      status = "",
      aging = "",
      supplierId = "",
      from = "",
      to = "",
    } = req.query;

    const where = {
      tenantId,
      status: {
        [Op.in]: ["sent", "received"],
      },
    };

    if (status) {
      where.status = status;
    }

    if (supplierId) {
      where.supplierId = supplierId;
    }

    if (from || to) {
      where.orderDate = {};
      if (from) where.orderDate[Op.gte] = from;
      if (to) where.orderDate[Op.lte] = to;
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
            { orderNumber: { [Op.like]: `%${search}%` } },
            { supplierName: { [Op.like]: `%${search}%` } },
            { supplierRnc: { [Op.like]: `%${search}%` } },
          ],
        },
      ];
    }

    const [purchaseOrders, suppliers, totalPayable, overduePayable, openOrders, receivedOrders] =
      await Promise.all([
        PurchaseOrder.findAll({
          where,
          include: [
            {
              model: Supplier,
              as: "supplier",
              attributes: ["id", "name", "rnc", "phone", "email"],
              required: false,
            },
          ],
          order: [
            ["dueDate", "ASC"],
            ["createdAt", "DESC"],
          ],
        }),

        Supplier.findAll({
          where: { tenantId },
          order: [["name", "ASC"]],
          attributes: ["id", "name", "rnc", "phone", "email"],
        }),

        PurchaseOrder.sum("total", {
          where: {
            tenantId,
            status: { [Op.in]: ["sent", "received"] },
          },
        }),

        PurchaseOrder.sum("total", {
          where: {
            tenantId,
            status: { [Op.in]: ["sent", "received"] },
            dueDate: { [Op.lt]: todayDateOnly() },
          },
        }),

        PurchaseOrder.count({
          where: {
            tenantId,
            status: { [Op.in]: ["sent", "received"] },
          },
        }),

        PurchaseOrder.count({
          where: {
            tenantId,
            status: "received",
          },
        }),
      ]);

    const rows = purchaseOrders.map((order) => {
      const plain = order.toJSON();
      const daysOverdue = getDaysOverdue(plain.dueDate);

      return {
        ...plain,
        daysOverdue,
        isOverdue: daysOverdue > 0,
        payableBalance: money(plain.total),
      };
    });

    return res.json({
      summary: {
        totalPayable: money(totalPayable),
        overduePayable: money(overduePayable),
        currentPayable: money(totalPayable) - money(overduePayable),
        openOrders,
        receivedOrders,
      },
      purchaseOrders: rows,
      suppliers,
    });
  } catch (error) {
    console.log("ACCOUNTS PAYABLE ERROR:", error);

    return res.status(500).json({
      message: "Error cargando cuentas por pagar",
    });
  }
};