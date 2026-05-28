import { Op, col, fn, literal } from "sequelize";
import { sequelize, Product, StockMovement, User } from "../models/index.js";
import {
  sanitizeString,
  sanitizeNumber,
  sanitizeInteger,
} from "../utils/sanitize.js";

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toInteger = (value, fallback = 0) => {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeProductPayload = (body) => {
  const productType =
    body.productType === "service" ? "service" : "product";

  const trackStock =
    productType === "service"
      ? false
      : body.trackStock === false
      ? false
      : true;

  return {
    name: sanitizeString(body.name, 120),
    sku: sanitizeString(body.sku, 50) || null,
    barcode: sanitizeString(body.barcode, 80) || null,
    description: sanitizeString(body.description, 1000) || null,
    category: sanitizeString(body.category, 120) || null,
    unit: sanitizeString(body.unit, 30) || "unidad",
    productType,
    trackStock,
    costPrice: sanitizeNumber(body.costPrice),
    salePrice: sanitizeNumber(body.salePrice),
    stock: trackStock ? sanitizeInteger(body.stock) : 0,
    minStock: trackStock ? sanitizeInteger(body.minStock) : 0,
  };
};

export const getProducts = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const search = sanitizeString(req.query.search || "", 120);
    const status = sanitizeString(req.query.status || "active", 20);
    const type = sanitizeString(req.query.type || "all", 20);
    const paginated = sanitizeString(req.query.paginated || "false", 10);

    const page = sanitizeInteger(req.query.page, 1);
    const limit = sanitizeInteger(req.query.limit, 25);

    const where = { tenantId };

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { sku: { [Op.like]: `%${search}%` } },
        { barcode: { [Op.like]: `%${search}%` } },
        { category: { [Op.like]: `%${search}%` } },
      ];
    }

    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;
    if (type === "product") where.productType = "product";
    if (type === "service") where.productType = "service";

    if (paginated !== "true") {
      const products = await Product.findAll({
        where,
        order: [["createdAt", "DESC"]],
      });

      return res.json(products);
    }

    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 5), 100);
    const offset = (safePage - 1) * safeLimit;

    const { rows, count } = await Product.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: safeLimit,
      offset,
    });

    const [totalProducts, totalServices, lowStockCount, inventoryValueRow] =
      await Promise.all([
        Product.count({
          where: {
            ...where,
            productType: "product",
          },
        }),

        Product.count({
          where: {
            ...where,
            productType: "service",
          },
        }),

        Product.count({
          where: {
            ...where,
            productType: "product",
            trackStock: true,
            stock: { [Op.lte]: col("minStock") },
          },
        }),

        Product.findOne({
          where: {
            ...where,
            productType: "product",
            trackStock: true,
          },
          attributes: [
            [
              fn("COALESCE", fn("SUM", literal("stock * costPrice")), 0),
              "inventoryValue",
            ],
          ],
          raw: true,
        }),
      ]);

    return res.json({
      data: rows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: count,
        totalPages: Math.ceil(count / safeLimit) || 1,
      },
      summary: {
        totalProducts,
        totalServices,
        lowStock: lowStockCount,
        inventoryValue: Number(inventoryValueRow?.inventoryValue || 0),
      },
    });
  } catch (error) {
    console.log("GET PRODUCTS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo productos" });
  }
};

export const getProductMovements = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const product = await Product.findOne({
      where: { id, tenantId },
    });

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const movements = await StockMovement.findAll({
      where: { tenantId, productId: id },
      include: [
        {
          model: User,
          as: "user",
          where: { tenantId },
          required: false,
          attributes: ["id", "name", "email", "role"],
        }
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json(movements);
  } catch (error) {
    console.log("GET PRODUCT MOVEMENTS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo movimientos" });
  }
};

export const createProduct = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const payload = normalizeProductPayload(req.body);

    if (!payload.name) {
      await transaction.rollback();
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    if (payload.stock < 0 || payload.minStock < 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "El stock y el stock mínimo no pueden ser negativos",
      });
    }

    if (payload.costPrice < 0 || payload.salePrice < 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "El costo y el precio no pueden ser negativos",
      });
    }

    if (payload.sku) {
      const exists = await Product.findOne({
        where: { tenantId, sku: payload.sku, isActive: true },
        transaction,
      });

      if (exists) {
        await transaction.rollback();
        return res.status(400).json({
          message: "Ya existe un producto activo con este SKU",
        });
      }
    }

    if (payload.barcode) {
      const exists = await Product.findOne({
        where: { tenantId, barcode: payload.barcode, isActive: true },
        transaction,
      });

      if (exists) {
        await transaction.rollback();
        return res.status(400).json({
          message: "Ya existe un producto activo con este código de barras",
        });
      }
    }

    const product = await Product.create(
      {
        tenantId,
        ...payload,
        sku: null,
      },
      { transaction }
    );

    const generatedSku =
      product.productType === "service"
        ? `SERV-${String(product.id).padStart(6, "0")}`
        : `PROD-${String(product.id).padStart(6, "0")}`;

    await product.update(
      {
        sku: generatedSku,
      },
      { transaction }
    );

    if (product.trackStock && Number(product.stock) > 0) {
      await StockMovement.create(
        {
          tenantId,
          productId: product.id,
          userId,
          type: "entry",
          quantity: Number(product.stock),
          previousStock: 0,
          newStock: Number(product.stock),
          reason: "Stock inicial",
          referenceType: "manual",
          referenceId: product.id,
          referenceNumber: product.sku || null,
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.status(201).json({
      message:
        product.productType === "service"
          ? "Servicio creado correctamente"
          : "Producto creado correctamente",
      product,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE PRODUCT ERROR:", error);
    return res.status(500).json({ message: "Error creando producto" });
  }
};

export const updateProduct = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const payload = normalizeProductPayload(req.body);

    const product = await Product.findOne({
      where: { id, tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    if (!payload.name) {
      await transaction.rollback();
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    if (payload.stock < 0 || payload.minStock < 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "El stock y el stock mínimo no pueden ser negativos",
      });
    }

    if (payload.costPrice < 0 || payload.salePrice < 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "El costo y el precio no pueden ser negativos",
      });
    }

    if (payload.sku) {
      const exists = await Product.findOne({
        where: {
          tenantId,
          sku: payload.sku,
          isActive: true,
          id: { [Op.ne]: id },
        },
        transaction,
      });

      if (exists) {
        await transaction.rollback();
        return res.status(400).json({
          message: "Ya existe otro producto activo con este SKU",
        });
      }
    }

    if (payload.barcode) {
      const exists = await Product.findOne({
        where: {
          tenantId,
          barcode: payload.barcode,
          isActive: true,
          id: { [Op.ne]: id },
        },
        transaction,
      });

      if (exists) {
        await transaction.rollback();
        return res.status(400).json({
          message: "Ya existe otro producto activo con este código de barras",
        });
      }
    }

    const previousStock = Number(product.stock || 0);
    const newStock = Number(payload.stock || 0);

    await product.update(payload, { transaction });

    if (payload.trackStock && previousStock !== newStock) {
      await StockMovement.create(
        {
          tenantId,
          productId: product.id,
          userId,
          type: "adjustment",
          quantity: Math.abs(newStock - previousStock),
          previousStock,
          newStock,
          reason: "Ajuste manual desde edición del producto",
          referenceType: "manual",
          referenceId: product.id,
          referenceNumber: product.sku || null,
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.json({
      message: "Producto actualizado correctamente",
      product,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("UPDATE PRODUCT ERROR:", error);
    return res.status(500).json({ message: "Error actualizando producto" });
  }
};

export const createStockMovement = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const { id } = req.params;

    const type = sanitizeString(req.body.type, 20);
    const quantity = sanitizeInteger(req.body.quantity);
    const newStock = sanitizeInteger(req.body.newStock);
    const reason = sanitizeString(req.body.reason, 255) || "Movimiento manual";
    const referenceNumber = sanitizeString(req.body.referenceNumber, 100) || null;
    const product = await Product.findOne({where: { id, tenantId, isActive: true }, transaction, lock: transaction.LOCK.UPDATE,});


    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    if (!product.trackStock || product.productType === "service") {
      await transaction.rollback();
      return res.status(400).json({
        message: "Este producto/servicio no controla inventario",
      });
    }

    const validTypes = ["entry", "exit", "adjustment", "return", "waste"];

    if (!validTypes.includes(type)) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Tipo de movimiento inválido",
      });
    }

    const previousStock = Number(product.stock || 0);
    const movementQuantity = toInteger(quantity);

    if (type !== "adjustment" && movementQuantity <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "La cantidad debe ser mayor a cero",
      });
    }

    let finalStock = previousStock;

    if (type === "entry" || type === "return") {
      finalStock = previousStock + movementQuantity;
    }

    if (type === "exit" || type === "waste") {
      finalStock = previousStock - movementQuantity;
    }

    if (type === "adjustment") {
      finalStock = toInteger(newStock);
    }

    if (finalStock < 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "El movimiento no puede dejar el stock negativo",
      });
    }

    const quantityToSave =
      type === "adjustment"
        ? Math.abs(finalStock - previousStock)
        : movementQuantity;

    await product.update({ stock: finalStock }, { transaction });

    const movement = await StockMovement.create(
      {
        tenantId,
        productId: product.id,
        userId,
        type,
        quantity: quantityToSave,
        previousStock,
        newStock: finalStock,
        reason,
        referenceType: "manual",
        referenceId: product.id,
        referenceNumber,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      message: "Movimiento registrado correctamente",
      product,
      movement,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE STOCK MOVEMENT ERROR:", error);
    return res.status(500).json({
      message: "Error registrando movimiento de inventario",
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const product = await Product.findOne({
      where: { id, tenantId },
    });

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    if (!product.isActive) {
      return res.status(400).json({
        message: "Este producto ya está desactivado",
      });
    }

    await product.update({ isActive: false });

    return res.json({
      message: "Producto desactivado correctamente",
    });
  } catch (error) {
    console.log("DEACTIVATE PRODUCT ERROR:", error);
    return res.status(500).json({
      message: "Error desactivando producto",
    });
  }
};

export const reactivateProduct = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const product = await Product.findOne({
      where: { id, tenantId },
    });

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    if (product.isActive) {
      return res.status(400).json({
        message: "Este producto ya está activo",
      });
    }

    if (product.sku) {
      const skuExists = await Product.findOne({
        where: {
          tenantId,
          sku: product.sku,
          isActive: true,
          id: { [Op.ne]: product.id },
        },
      });

      if (skuExists) {
        return res.status(400).json({
          message: "Ya existe un producto activo con este SKU",
        });
      }
    }

    if (product.barcode) {
      const barcodeExists = await Product.findOne({
        where: {
          tenantId,
          barcode: product.barcode,
          isActive: true,
          id: { [Op.ne]: product.id },
        },
      });

      if (barcodeExists) {
        return res.status(400).json({
          message: "Ya existe un producto activo con este código de barras",
        });
      }
    }

    await product.update({ isActive: true });

    return res.json({
      message: "Producto reactivado correctamente",
      product,
    });
  } catch (error) {
    console.log("REACTIVATE PRODUCT ERROR:", error);
    return res.status(500).json({
      message: "Error reactivando producto",
    });
  }
};

const cleanText = (value, max = 255) => {
  return sanitizeString(value, max);
};

const normalizeImportedProduct = (row) => {
  const productType = row.productType === "service" ? "service" : "product";
  const trackStock =
    productType === "service" ? false : row.trackStock === false ? false : true;

  return {
    name: cleanText(row.name),
    sku: cleanText(row.sku) || null,
    barcode: cleanText(row.barcode) || null,
    description: cleanText(row.description) || null,
    category: cleanText(row.category) || null,
    unit: cleanText(row.unit) || (productType === "service" ? "servicio" : "unidad"),
    productType,
    trackStock,
    costPrice: sanitizeNumber(row.costPrice),
    salePrice: sanitizeNumber(row.salePrice),
    stock: trackStock ? sanitizeInteger(row.stock) : 0,
    minStock: trackStock ? sanitizeInteger(row.minStock) : 0,
    isActive: true,
  };
};

export const importProducts = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;

    const rows = Array.isArray(req.body.products) ? req.body.products : [];
    if (rows.length > 1000) {
      await transaction.rollback();
      return res.status(400).json({
        message: "No puedes importar más de 1000 productos a la vez",
      });
    }
    const updateExisting = req.body.updateExisting === true;

    if (!rows.length) {
      await transaction.rollback();
      return res.status(400).json({
        message: "No hay productos para importar",
      });
    }

    const result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const payload = normalizeImportedProduct(rows[index]);

      if (!payload.name) {
        result.skipped += 1;
        result.errors.push({
          row: rowNumber,
          message: "El nombre del producto es obligatorio",
        });
        continue;
      }

      if (payload.stock < 0 || payload.minStock < 0) {
        result.skipped += 1;
        result.errors.push({
          row: rowNumber,
          message: "El stock y stock mínimo no pueden ser negativos",
        });
        continue;
      }

      if (payload.costPrice < 0 || payload.salePrice < 0) {
        result.skipped += 1;
        result.errors.push({
          row: rowNumber,
          message: "El costo y precio no pueden ser negativos",
        });
        continue;
      }

      let existingProduct = null;

      if (payload.sku) {
        existingProduct = await Product.findOne({
          where: {
            tenantId,
            sku: payload.sku,
            isActive: true,
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
      }

      if (!existingProduct && payload.barcode) {
        existingProduct = await Product.findOne({
          where: {
            tenantId,
            barcode: payload.barcode,
            isActive: true,
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
      }

      if (existingProduct && !updateExisting) {
        result.skipped += 1;
        result.errors.push({
          row: rowNumber,
          message: `Producto duplicado por SKU o código de barras: ${
            payload.sku || payload.barcode
          }`,
        });
        continue;
      }

      if (existingProduct && updateExisting) {
        const previousStock = Number(existingProduct.stock || 0);
        const newStock = Number(payload.stock || 0);

        await existingProduct.update(payload, { transaction });

        if (payload.trackStock && previousStock !== newStock) {
          await StockMovement.create(
            {
              tenantId,
              productId: existingProduct.id,
              userId,
              type: "adjustment",
              quantity: Math.abs(newStock - previousStock),
              previousStock,
              newStock,
              reason: "Ajuste por importación de inventario",
              referenceType: "system",
              referenceId: existingProduct.id,
              referenceNumber: existingProduct.sku || null,
            },
            { transaction }
          );
        }

        result.updated += 1;
        continue;
      }

      const product = await Product.create(
        {
          tenantId,
          ...payload,
        },
        { transaction }
      );

      if (!product.sku) {
        const generatedSku =
          product.productType === "service"
            ? `SERV-${String(product.id).padStart(6, "0")}`
            : `PROD-${String(product.id).padStart(6, "0")}`;

        await product.update(
          {
            sku: generatedSku,
          },
          { transaction }
        );
      }

      if (product.trackStock && Number(product.stock) > 0) {
        await StockMovement.create(
          {
            tenantId,
            productId: product.id,
            userId,
            type: "entry",
            quantity: Number(product.stock),
            previousStock: 0,
            newStock: Number(product.stock),
            reason: "Stock inicial por importación",
            referenceType: "system",
            referenceId: product.id,
            referenceNumber: product.sku || null,
          },
          { transaction }
        );
      }

      result.created += 1;
    }

    await transaction.commit();

    return res.json({
      message: "Importación procesada correctamente",
      ...result,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("IMPORT PRODUCTS ERROR:", error);

    return res.status(500).json({
      message: "Error importando inventario",
    });
  }
};