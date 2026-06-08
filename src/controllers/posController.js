import { Op } from "sequelize";
import {
  sequelize,
  CashRegister,
  CashSession,
  PosSale,
  PosSaleItem,
  Product,
  StockMovement,
  User,
} from "../models/index.js";
import { sanitizeString, sanitizeNumber, sanitizeInteger } from "../utils/sanitize.js";

const generateCode = (id) => `CAJA-${String(id).padStart(3, "0")}`;
const generateSaleNumber = (id) => `POS-${String(id).padStart(8, "0")}`;

export const getCashRegisters = async (req, res) => {
  try {
    const registers = await CashRegister.findAll({
      where: { tenantId: req.user.tenantId },
      order: [["createdAt", "DESC"]],
    });

    return res.json(registers);
  } catch (error) {
    console.log("GET CASH REGISTERS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo cajas" });
  }
};

export const createCashRegister = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const name = sanitizeString(req.body.name, 120);

    if (!name) {
      return res.status(400).json({ message: "El nombre de la caja es obligatorio" });
    }

    const register = await CashRegister.create({
      tenantId,
      name,
      code: "TEMP",
      createdBy: req.user.id,
      isActive: true,
    });

    await register.update({
      code: generateCode(register.id),
    });

    return res.status(201).json({
      message: "Caja creada correctamente",
      register,
    });
  } catch (error) {
    console.log("CREATE CASH REGISTER ERROR:", error);
    return res.status(500).json({ message: "Error creando caja" });
  }
};

export const updateCashRegister = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const register = await CashRegister.findOne({
      where: { id, tenantId },
    });

    if (!register) {
      return res.status(404).json({ message: "Caja no encontrada" });
    }

    const name = sanitizeString(req.body.name, 120);
    const isActive = req.body.isActive === false ? false : true;

    await register.update({
      name: name || register.name,
      isActive,
    });

    return res.json({
      message: "Caja actualizada correctamente",
      register,
    });
  } catch (error) {
    console.log("UPDATE CASH REGISTER ERROR:", error);
    return res.status(500).json({ message: "Error actualizando caja" });
  }
};

export const getOpenSession = async (req, res) => {
  try {
    const session = await CashSession.findOne({
      where: {
        tenantId: req.user.tenantId,
        userId: req.user.id,
        status: "open",
      },
      include: [{ model: CashRegister, as: "cashRegister" }],
      order: [["openedAt", "DESC"]],
    });

    return res.json(session);
  } catch (error) {
    console.log("GET OPEN SESSION ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo sesión de caja" });
  }
};

export const openCashSession = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const cashRegisterId = sanitizeInteger(req.body.cashRegisterId);
    const openingAmount = sanitizeNumber(req.body.openingAmount);

    const register = await CashRegister.findOne({
      where: { id: cashRegisterId, tenantId, isActive: true },
    });

    if (!register) {
      return res.status(404).json({ message: "Caja no encontrada o inactiva" });
    }

    const existingOpenSession = await CashSession.findOne({
      where: {
        tenantId,
        cashRegisterId,
        status: "open",
      },
    });

    if (existingOpenSession) {
      return res.status(400).json({
        message: "Esta caja ya está abierta",
      });
    }

    const userOpenSession = await CashSession.findOne({
      where: {
        tenantId,
        userId,
        status: "open",
      },
    });

    if (userOpenSession) {
      return res.status(400).json({
        message: "Ya tienes una caja abierta",
      });
    }

    const session = await CashSession.create({
      tenantId,
      cashRegisterId,
      userId,
      openingAmount,
      status: "open",
    });

    return res.status(201).json({
      message: "Caja abierta correctamente",
      session,
    });
  } catch (error) {
    console.log("OPEN CASH SESSION ERROR:", error);
    return res.status(500).json({ message: "Error abriendo caja" });
  }
};

export const closeCashSession = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { id } = req.params;
    const closingAmount = sanitizeNumber(req.body.closingAmount);

    const session = await CashSession.findOne({
      where: {
        id,
        tenantId,
        userId,
        status: "open",
      },
    });

    if (!session) {
      return res.status(404).json({ message: "Sesión de caja no encontrada" });
    }

    const cashSales = await PosSale.sum("total", {
      where: {
        tenantId,
        cashSessionId: session.id,
        paymentMethod: "cash",
        status: "paid",
      },
    });

    const totalSales = await PosSale.sum("total", {
      where: {
        tenantId,
        cashSessionId: session.id,
        status: "paid",
      },
    });

    const openingAmount = Number(session.openingAmount || 0);
    const expectedAmount = openingAmount + Number(cashSales || 0);
    const difference = closingAmount - expectedAmount;

    await session.update({
      closingAmount,
      expectedAmount,
      difference,
      totalSales: Number(totalSales || 0),
      status: "closed",
      closedAt: new Date(),
    });

    return res.json({
      message: "Caja cerrada correctamente",
      session,
      summary: {
        openingAmount,
        cashSales: Number(cashSales || 0),
        totalSales: Number(totalSales || 0),
        expectedAmount,
        closingAmount,
        difference,
      },
    });
  } catch (error) {
    console.log("CLOSE CASH SESSION ERROR:", error);
    return res.status(500).json({ message: "Error cerrando caja" });
  }
};

export const createPosSale = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;

    const cashSessionId = sanitizeInteger(req.body.cashSessionId);
    const paymentMethod = sanitizeString(req.body.paymentMethod || "cash", 20);
    const amountPaid = sanitizeNumber(req.body.amountPaid);
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!items.length) {
      await transaction.rollback();
      return res.status(400).json({ message: "Agrega productos al ticket" });
    }

    const session = await CashSession.findOne({
      where: {
        id: cashSessionId,
        tenantId,
        userId,
        status: "open",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!session) {
      await transaction.rollback();
      return res.status(400).json({ message: "No tienes una caja abierta" });
    }

    let subtotal = 0;
    const saleItems = [];

    for (const item of items) {
      const productId = sanitizeInteger(item.productId);
      const quantity = sanitizeInteger(item.quantity);

      if (!productId || quantity <= 0) {
        await transaction.rollback();
        return res.status(400).json({ message: "Producto o cantidad inválida" });
      }

      const product = await Product.findOne({
        where: {
          id: productId,
          tenantId,
          isActive: true,
          productType: "product",
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      if (product.trackStock && Number(product.stock) < quantity) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Stock insuficiente para ${product.name}`,
        });
      }

      const unitPrice = Number(product.salePrice || 0);
      const total = unitPrice * quantity;
      subtotal += total;

      saleItems.push({
        product,
        quantity,
        unitPrice,
        total,
      });
    }

    const total = subtotal;
    const changeAmount = Math.max(amountPaid - total, 0);

    if (amountPaid < total && paymentMethod === "cash") {
      await transaction.rollback();
      return res.status(400).json({ message: "El monto pagado no cubre el total" });
    }

    const sale = await PosSale.create(
      {
        tenantId,
        cashRegisterId: session.cashRegisterId,
        cashSessionId: session.id,
        userId,
        saleNumber: "TEMP",
        subtotal,
        discountTotal: 0,
        taxTotal: 0,
        total,
        paymentMethod,
        amountPaid,
        changeAmount,
        status: "paid",
      },
      { transaction }
    );

    await sale.update(
      {
        saleNumber: generateSaleNumber(sale.id),
      },
      { transaction }
    );

    for (const item of saleItems) {
      await PosSaleItem.create(
        {
          tenantId,
          posSaleId: sale.id,
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: 0,
          total: item.total,
        },
        { transaction }
      );

      if (item.product.trackStock) {
        const previousStock = Number(item.product.stock || 0);
        const newStock = previousStock - item.quantity;

        await item.product.update(
          { stock: newStock },
          { transaction }
        );

        await StockMovement.create(
          {
            tenantId,
            productId: item.product.id,
            userId,
            type: "exit",
            quantity: item.quantity,
            previousStock,
            newStock,
            reason: "Venta POS",
            referenceType: "system",
            referenceId: sale.id,
            referenceNumber: sale.saleNumber,
          },
          { transaction }
        );
      }
    }

    await session.update(
      {
        totalSales: Number(session.totalSales || 0) + total,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      message: "Venta registrada correctamente",
      sale,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE POS SALE ERROR:", error);
    return res.status(500).json({ message: "Error registrando venta POS" });
  }
};

export const getPosSales = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const where = {
      tenantId,
      status: "paid",
    };

    const cashRegisterId = sanitizeInteger(req.query.cashRegisterId);
    const paymentMethod = sanitizeString(req.query.paymentMethod, 20);
    const dateFrom = sanitizeString(req.query.dateFrom, 20);
    const dateTo = sanitizeString(req.query.dateTo, 20);

    if (cashRegisterId) {
      where.cashRegisterId = cashRegisterId;
    }

    if (paymentMethod && paymentMethod !== "all") {
      where.paymentMethod = paymentMethod;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};

      if (dateFrom) {
        where.createdAt[Op.gte] = new Date(`${dateFrom}T00:00:00`);
      }

      if (dateTo) {
        where.createdAt[Op.lte] = new Date(`${dateTo}T23:59:59`);
      }
    }

    const sales = await PosSale.findAll({
      where,
      include: [
        {
          model: PosSaleItem,
          as: "items",
        },
        {
          model: CashRegister,
          as: "cashRegister",
          attributes: ["id", "name", "code"],
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 300,
    });

    const summary = sales.reduce(
      (acc, sale) => {
        const total = Number(sale.total || 0);
        const method = sale.paymentMethod || "cash";

        acc.salesCount += 1;
        acc.total += total;

        if (!acc.byPaymentMethod[method]) {
          acc.byPaymentMethod[method] = 0;
        }

        acc.byPaymentMethod[method] += total;

        return acc;
      },
      {
        salesCount: 0,
        total: 0,
        byPaymentMethod: {
          cash: 0,
          card: 0,
          transfer: 0,
          check: 0,
          mixed: 0,
        },
      }
    );

    return res.json({
      sales,
      summary,
    });
  } catch (error) {
    console.log("GET POS SALES ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo ventas POS" });
  }
};

export const getPosSaleDetail = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const sale = await PosSale.findOne({
      where: {
        id,
        tenantId,
      },
      include: [
        {
          model: PosSaleItem,
          as: "items",
        },
        {
          model: CashRegister,
          as: "cashRegister",
          attributes: ["id", "name", "code"],
        },
        {
          model: CashSession,
          as: "cashSession",
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    return res.json(sale);
  } catch (error) {
    console.log("GET POS SALE DETAIL ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo detalle de venta" });
  }
};