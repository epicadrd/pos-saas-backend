import { Op } from "sequelize";
import {
  sequelize,
  Product,
  StockMovement,
  InventoryCount,
  InventoryCountItem,
  User,
} from "../models/index.js";
import { sanitizeString, sanitizeInteger } from "../utils/sanitize.js";

const parseCountedStock = (value) => {
  if (value === "" || value === null || value === undefined) return null;

  const number = parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export const getInventoryCounts = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const counts = await InventoryCount.findAll({
      where: { tenantId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email"],
          required: false,
        },
        {
          model: InventoryCountItem,
          as: "items",
          attributes: ["id", "difference", "countedStock"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const data = counts.map((count) => {
      const items = count.items || [];
      const countedItems = items.filter((item) => item.countedStock !== null).length;
      const differences = items.filter((item) => Number(item.difference || 0) !== 0).length;

      return {
        ...count.toJSON(),
        totalItems: items.length,
        countedItems,
        differences,
      };
    });

    return res.json(data);
  } catch (error) {
    console.log("GET INVENTORY COUNTS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo conteos" });
  }
};

export const getInventoryCountById = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const count = await InventoryCount.findOne({
      where: { id, tenantId },
      include: [
        {
          model: InventoryCountItem,
          as: "items",
          include: [
            {
              model: Product,
              as: "product",
              attributes: [
                "id",
                "name",
                "sku",
                "barcode",
                "category",
                "unit",
                "stock",
                "minStock",
                "costPrice",
                "isActive",
              ],
            },
          ],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
      order: [[{ model: InventoryCountItem, as: "items" }, "id", "ASC"]],
    });

    if (!count) {
      return res.status(404).json({ message: "Conteo no encontrado" });
    }

    return res.json(count);
  } catch (error) {
    console.log("GET INVENTORY COUNT DETAIL ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo el conteo" });
  }
};

export const createInventoryCount = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;

    const name = sanitizeString(req.body.name, 120);
    const notes = sanitizeString(req.body.notes, 1000) || null;
    const category = sanitizeString(req.body.category, 120);
    const search = sanitizeString(req.body.search, 120);

    if (!name) {
      await transaction.rollback();
      return res.status(400).json({ message: "El nombre del conteo es obligatorio" });
    }

    const where = {
      tenantId,
      isActive: true,
      productType: "product",
      trackStock: true,
    };

    if (category) where.category = category;

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { sku: { [Op.like]: `%${search}%` } },
        { barcode: { [Op.like]: `%${search}%` } },
      ];
    }

    const products = await Product.findAll({
      where,
      order: [["name", "ASC"]],
      transaction,
    });

    if (products.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "No hay productos activos para crear este conteo",
      });
    }

    const count = await InventoryCount.create(
      {
        tenantId,
        createdBy: userId,
        name,
        notes,
        status: "draft",
      },
      { transaction }
    );

    const items = products.map((product) => ({
      inventoryCountId: count.id,
      productId: product.id,
      systemStock: Number(product.stock || 0),
      countedStock: null,
      difference: 0,
    }));

    await InventoryCountItem.bulkCreate(items, { transaction });

    await transaction.commit();

    return res.status(201).json({
      message: "Conteo creado correctamente",
      count,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE INVENTORY COUNT ERROR:", error);
    return res.status(500).json({ message: "Error creando conteo" });
  }
};

export const updateInventoryCount = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const count = await InventoryCount.findOne({
      where: { id, tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!count) {
      await transaction.rollback();
      return res.status(404).json({ message: "Conteo no encontrado" });
    }

    if (count.status === "applied") {
      await transaction.rollback();
      return res.status(400).json({
        message: "Este conteo ya fue aplicado y no puede modificarse",
      });
    }

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const status = req.body.status === "completed" ? "completed" : "draft";

    for (const item of items) {
      const itemId = sanitizeInteger(item.id);
      const countedStock = parseCountedStock(item.countedStock);
      const notes = sanitizeString(item.notes, 255) || null;

      const countItem = await InventoryCountItem.findOne({
        where: { id: itemId, inventoryCountId: count.id },
        transaction,
      });

      if (!countItem) continue;

      const difference =
        countedStock === null ? 0 : countedStock - Number(countItem.systemStock || 0);

      await countItem.update(
        {
          countedStock,
          difference,
          notes,
        },
        { transaction }
      );
    }

    await count.update(
      {
        status,
        completedAt: status === "completed" ? new Date() : null,
      },
      { transaction }
    );

    await transaction.commit();

    return res.json({
      message:
        status === "completed"
          ? "Conteo completado correctamente"
          : "Conteo guardado correctamente",
    });
  } catch (error) {
    await transaction.rollback();
    console.log("UPDATE INVENTORY COUNT ERROR:", error);
    return res.status(500).json({ message: "Error guardando conteo" });
  }
};

export const applyInventoryCount = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const { id } = req.params;

    const count = await InventoryCount.findOne({
      where: { id, tenantId },
      include: [
        {
          model: InventoryCountItem,
          as: "items",
        },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!count) {
      await transaction.rollback();
      return res.status(404).json({ message: "Conteo no encontrado" });
    }

    if (count.status === "applied") {
      await transaction.rollback();
      return res.status(400).json({ message: "Este conteo ya fue aplicado" });
    }

    const items = count.items || [];
    const pendingItems = items.filter((item) => item.countedStock === null);

    if (pendingItems.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "No puedes aplicar un conteo con productos pendientes",
      });
    }

    let adjustedProducts = 0;

    for (const item of items) {
      const product = await Product.findOne({
        where: {
          id: item.productId,
          tenantId,
          isActive: true,
          productType: "product",
          trackStock: true,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!product) continue;

      const previousStock = Number(product.stock || 0);
      const newStock = Number(item.countedStock || 0);
      const difference = newStock - previousStock;

      if (difference === 0) continue;

      await product.update({ stock: newStock }, { transaction });

      await StockMovement.create(
        {
          tenantId,
          productId: product.id,
          userId,
          type: "adjustment",
          quantity: Math.abs(difference),
          previousStock,
          newStock,
          reason: `Ajuste por conteo de inventario: ${count.name}`,
          referenceType: "manual",
          referenceId: count.id,
          referenceNumber: `COUNT-${count.id}`,
        },
        { transaction }
      );

      adjustedProducts += 1;
    }

    await count.update(
      {
        status: "applied",
        completedAt: count.completedAt || new Date(),
        appliedAt: new Date(),
      },
      { transaction }
    );

    await transaction.commit();

    return res.json({
      message: `Conteo aplicado correctamente. Productos ajustados: ${adjustedProducts}`,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("APPLY INVENTORY COUNT ERROR:", error);
    return res.status(500).json({ message: "Error aplicando conteo" });
  }
};

export const deleteInventoryCount = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const count = await InventoryCount.findOne({
      where: { id, tenantId },
      transaction,
    });

    if (!count) {
      await transaction.rollback();
      return res.status(404).json({ message: "Conteo no encontrado" });
    }

    if (count.status === "applied") {
      await transaction.rollback();
      return res.status(400).json({
        message: "No puedes eliminar un conteo ya aplicado",
      });
    }

    await InventoryCountItem.destroy({
      where: { inventoryCountId: count.id },
      transaction,
    });

    await count.destroy({ transaction });

    await transaction.commit();

    return res.json({ message: "Conteo eliminado correctamente" });
  } catch (error) {
    await transaction.rollback();
    console.log("DELETE INVENTORY COUNT ERROR:", error);
    return res.status(500).json({ message: "Error eliminando conteo" });
  }
};