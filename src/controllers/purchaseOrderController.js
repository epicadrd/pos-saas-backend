import {
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  StockMovement,
  sequelize,
  User,
} from "../models/index.js";

const generateOrderNumber = async (tenantId) => {
  const count = await PurchaseOrder.count({
    where: { tenantId },
  });

  return `OC-${String(count + 1).padStart(6, "0")}`;
};

const receiveOrderInventory = async ({ order, tenantId, userId, transaction }) => {
  for (const item of order.items) {
    if (!item.productId) continue;

    const product = await Product.findOne({
      where: {
        id: item.productId,
        tenantId,
        isActive: true,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) continue;

    if (product.productType === "service" || product.trackStock === false) {
      continue;
    }

    const previousStock = Number(product.stock || 0);
    const quantity = Number(item.quantity || 0);
    const newStock = previousStock + quantity;

    await product.update(
      {
        stock: newStock,
        costPrice: Number(item.cost || 0),
      },
      { transaction }
    );

    await StockMovement.create(
      {
        tenantId,
        productId: product.id,
        userId,
        type: "entry",
        quantity,
        previousStock,
        newStock,
        reason: `Entrada por orden de compra ${order.orderNumber}`,
        referenceType: "purchase_order",
        referenceId: order.id,
        referenceNumber: order.orderNumber,
      },
      { transaction }
    );
  }
};

export const getPurchaseOrders = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const orders = await PurchaseOrder.findAll({
      where: { tenantId },
      include: [
        {
          model: PurchaseOrderItem,
          as: "items",
          where: { tenantId },
          required: false,
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

    return res.json(orders);
  } catch (error) {
    console.log("GET PURCHASE ORDERS ERROR:", error);
    return res.status(500).json({
      message: "Error obteniendo órdenes de compra",
    });
  }
};

export const createPurchaseOrder = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;

    const {
      supplierName,
      supplierRnc,
      supplierPhone,
      supplierEmail,
      expectedDate,
      notes,
      status = "draft",
      items = [],
    } = req.body;

    if (!supplierName) {
      await transaction.rollback();
      return res.status(400).json({ message: "El suplidor es obligatorio" });
    }

    if (!items.length) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Debes agregar al menos un producto",
      });
    }

    let subtotal = 0;

    const formattedItems = items.map((item) => {
      const quantity = Number(item.quantity || 1);
      const cost = Number(item.cost || 0);
      const total = quantity * cost;

      subtotal += total;

      return {
        productId: item.productId || null,
        productName: item.productName,
        quantity,
        cost,
        total,
      };
    });

    const tax = subtotal * 0.18;
    const total = subtotal + tax;
    const orderNumber = await generateOrderNumber(tenantId);

    const order = await PurchaseOrder.create(
      {
        tenantId,
        orderNumber,
        supplierName,
        supplierRnc,
        supplierPhone,
        supplierEmail,
        expectedDate: expectedDate || null,
        subtotal,
        tax,
        total,
        notes,
        status,
        createdBy: userId,
        updatedBy: userId,
      },
      { transaction }
    );

    for (const item of formattedItems) {
      await PurchaseOrderItem.create(
        {
          tenantId,
          purchaseOrderId: order.id,
          ...item,
        },
        { transaction }
      );
    }

    const orderWithItems = await PurchaseOrder.findByPk(order.id, {
      include: [{
        model: PurchaseOrderItem,
        as: "items",
        where: { tenantId },
        required: false,
      }],
      transaction,
    });

    if (status === "received") {
      await receiveOrderInventory({
        order: orderWithItems,
        tenantId,
        userId,
        transaction,
      });
    }

    await transaction.commit();

    const createdOrder = await PurchaseOrder.findOne({
      where: { id: order.id, tenantId },
      include: [
        {
          model: PurchaseOrderItem,
          as: "items",
          where: { tenantId },
          required: false,
        },
      ],
    });

    return res.status(201).json({
      message: "Orden de compra creada correctamente",
      purchaseOrder: createdOrder,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE PURCHASE ORDER ERROR:", error);
    return res.status(500).json({
      message: "Error creando orden de compra",
    });
  }
};

export const updatePurchaseOrderStatus = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const { status } = req.body;

    if (!["draft", "sent", "received", "cancelled"].includes(status)) {
      await transaction.rollback();
      return res.status(400).json({ message: "Estado inválido" });
    }

    const order = await PurchaseOrder.findOne({
      where: { id, tenantId },
      include: [
        {
          model: PurchaseOrderItem,
          as: "items",
          where: { tenantId },
          required: false,
        },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({
        message: "Orden de compra no encontrada",
      });
    }

    const previousStatus = order.status;

    if (previousStatus === "received" && status !== "received") {
      await transaction.rollback();
      return res.status(400).json({
        message: "Una orden recibida no puede revertirse por ahora",
      });
    }

    if (previousStatus !== "received" && status === "received") {
      await receiveOrderInventory({
        order,
        tenantId,
        userId,
        transaction,
      });
    }

    await order.update({ status, updatedBy: userId }, { transaction });

    await transaction.commit();

    return res.json({
      message: "Estado actualizado correctamente",
      purchaseOrder: order,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("UPDATE PURCHASE ORDER STATUS ERROR:", error);
    return res.status(500).json({
      message: "Error actualizando estado",
    });
  }
};

export const deletePurchaseOrder = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const order = await PurchaseOrder.findOne({
      where: { id, tenantId },
    });

    if (!order) {
      return res.status(404).json({
        message: "Orden de compra no encontrada",
      });
    }

    if (order.status === "received") {
      return res.status(400).json({
        message: "No puedes eliminar una orden ya recibida",
      });
    }

    await PurchaseOrderItem.destroy({
      where: {
        purchaseOrderId: order.id,
        tenantId,
      },
    });

    await order.destroy();

    return res.json({
      message: "Orden de compra eliminada correctamente",
    });
  } catch (error) {
    console.log("DELETE PURCHASE ORDER ERROR:", error);
    return res.status(500).json({
      message: "Error eliminando orden de compra",
    });
  }
};