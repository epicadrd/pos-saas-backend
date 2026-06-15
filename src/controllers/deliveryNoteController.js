import {
  sequelize,
  DeliveryNote,
  DeliveryNoteItem,
  Product,
  StockMovement,
  Tenant,
  Invoice,
  InvoiceItem,
  User
} from "../models/index.js";
import {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
  sanitizeNumber,
  sanitizeInteger,
} from "../utils/sanitize.js";


const generateDeliveryNoteNumber = async (tenantId, transaction) => {
  const count = await DeliveryNote.count({
    where: { tenantId },
    transaction,
  });

  return `CON-${String(count + 1).padStart(6, "0")}`;
};

const cleanDate = (value) => {
  if (!value) return null;
  if (value === "Invalid date") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return value;
};

const generateInvoiceNumber = (tenant) => {
  const prefix = tenant.invoicePrefix || "FAC";
  const nextNumber = Number(tenant.invoiceNextNumber || 1);
  const digits = Number(tenant.invoiceDigits || 6);

  return `${prefix}-${String(nextNumber).padStart(digits, "0")}`;
};

const normalizeItems = async ({
  items,
  tenantId,
  transaction,
  shouldValidateStock = false,
}) => {
  const normalizedItems = [];

  for (const item of items) {
    const productId = item.productId || item.id;
    const requestedQuantity = sanitizeInteger(item.requestedQuantity || item.quantity,1);
    const dispatchedQuantity = sanitizeInteger(item.dispatchedQuantity || item.quantity,requestedQuantity);
    const unitPrice = sanitizeNumber(item.unitPrice ?? item.price, 0);
    const discount = sanitizeNumber(item.discount, 0);

    if (!productId) throw new Error("Producto inválido en conduce");
    if (requestedQuantity <= 0) {
      throw new Error("La cantidad solicitada debe ser mayor a cero");
    }
    if (dispatchedQuantity <= 0) {
      throw new Error("La cantidad despachada debe ser mayor a cero");
    }
    if (dispatchedQuantity > requestedQuantity) {
      throw new Error("La cantidad despachada no puede ser mayor a la solicitada");
    }

    const product = await Product.findOne({
      where: { id: productId, tenantId, isActive: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      throw new Error("Producto no encontrado o no pertenece a esta empresa");
    }

    const isService =
      product.productType === "service" || product.trackStock === false;

    if (
      shouldValidateStock &&
      !isService &&
      Number(product.stock || 0) < dispatchedQuantity
    ) {
      throw new Error(
        `Stock insuficiente para ${product.name}. Disponible: ${product.stock}`
      );
    }

    const grossSubtotal = dispatchedQuantity * unitPrice;
    const discountPercent = Math.min(Math.max(discount, 0), 100);
    const discountAmount = grossSubtotal * (discountPercent / 100);
    const subtotal = Math.max(grossSubtotal - discountAmount, 0);
    const tenant = await Tenant.findByPk(tenantId, { transaction });


const tenantTaxRate =
  tenant?.invoiceTaxEnabled === false
    ? 0
    : tenant?.country === "US"
    ? Number(tenant.usStateTaxRate || 0) +
      Number(tenant.usCountyTaxRate || 0) +
      Number(tenant.usCityTaxRate || 0)
    : Number(tenant?.invoiceTaxRate || 18);

const taxRate = item.isTaxable === false ? 0 : tenantTaxRate;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    normalizedItems.push({
      product,
      productId: product.id,
      productName: product.name,
      description:sanitizeString(item.description || product.description || product.name, 1000),
      unit:sanitizeString(item.unit || product.unit || "UND", 30),
      requestedQuantity,
      dispatchedQuantity,
      unitPrice,
      discount: discountPercent,
      subtotal,
      tax,
      total,
      isTaxable: taxRate > 0,
      taxRate,
    });
  }

  return normalizedItems;
};

const sumTotals = (items) => {
  return {
    subtotal: items.reduce((acc, item) => acc + Number(item.subtotal || 0), 0),
    tax: items.reduce((acc, item) => acc + Number(item.tax || 0), 0),
    total: items.reduce((acc, item) => acc + Number(item.total || 0), 0),
  };
};

const saveItems = async ({ deliveryNote, items, tenantId, transaction }) => {
  await DeliveryNoteItem.destroy({
    where: { deliveryNoteId: deliveryNote.id, tenantId },
    transaction,
  });

  for (const item of items) {
    await DeliveryNoteItem.create(
      {
        tenantId,
        deliveryNoteId: deliveryNote.id,
        productId: item.productId,
        productName: item.productName,
        description: item.description,
        unit: item.unit,
        requestedQuantity: item.requestedQuantity,
        dispatchedQuantity: item.dispatchedQuantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        subtotal: item.subtotal,
        tax: item.tax,
        total: item.total,
        isTaxable: item.isTaxable,
        taxRate: item.taxRate,
      },
      { transaction }
    );
  }
};

const applyStockExit = async ({
  deliveryNote,
  items,
  tenantId,
  userId,
  transaction,
}) => {
  for (const item of items) {
    const product = item.product;

    const isService =
      product.productType === "service" || product.trackStock === false;

    if (isService) continue;

    const previousStock = Number(product.stock || 0);
    const newStock = previousStock - Number(item.dispatchedQuantity || 0);

    if (newStock < 0) {
      throw new Error(`Stock insuficiente para ${product.name}`);
    }

    await product.update({ stock: newStock }, { transaction });

    await StockMovement.create(
      {
        tenantId,
        productId: product.id,
        userId,
        type: "exit",
        quantity: item.dispatchedQuantity,
        previousStock,
        newStock,
        reason: "Salida por conduce",
        referenceType: "delivery_note",
        referenceId: deliveryNote.id,
        referenceNumber: deliveryNote.deliveryNoteNumber,
      },
      { transaction }
    );
  }
};

const returnStock = async ({ deliveryNote, tenantId, userId, transaction }) => {
  const movements = await StockMovement.findAll({
    where: {
      tenantId,
      referenceType: "delivery_note",
      referenceId: deliveryNote.id,
      type: "exit",
    },
    transaction,
  });

  for (const movement of movements) {
    const product = await Product.findOne({
      where: { id: movement.productId, tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) continue;

    const previousStock = Number(product.stock || 0);
    const newStock = previousStock + Number(movement.quantity || 0);

    await product.update({ stock: newStock }, { transaction });

    await StockMovement.create(
      {
        tenantId,
        productId: product.id,
        userId,
        type: "return",
        quantity: movement.quantity,
        previousStock,
        newStock,
        reason: "Anulación de conduce",
        referenceType: "delivery_note",
        referenceId: deliveryNote.id,
        referenceNumber: deliveryNote.deliveryNoteNumber,
      },
      { transaction }
    );
  }
};

export const getDeliveryNotes = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const deliveryNotes = await DeliveryNote.findAll({
      where: { tenantId },
      include: [
      {model: DeliveryNoteItem,as: "items",where: { tenantId },required: false,},
      {model: User, as: "creator", where: { tenantId }, required: false, attributes: ["id", "name", "email", "role"],},
      {model: User, as: "updater", where: { tenantId }, required: false, attributes: ["id", "name", "email", "role"],},],
      order: [["createdAt", "DESC"]],
    });

    return res.json(deliveryNotes);
  } catch (error) {
    console.log("GET DELIVERY NOTES ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo conduces" });
  }
};

export const getDeliveryNoteById = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const deliveryNote = await DeliveryNote.findOne({
      where: { id, tenantId },
      include: [{model: DeliveryNoteItem, as: "items", where: { tenantId },required: false,},],
    });

    if (!deliveryNote) {
      return res.status(404).json({ message: "Conduce no encontrado" });
    }

    return res.json(deliveryNote);
  } catch (error) {
    console.log("GET DELIVERY NOTE ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo conduce" });
  }
};

export const createDeliveryNote = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;

const customerName = sanitizeString(req.body.customerName, 120);
const customerRnc = sanitizeString(req.body.customerRnc, 30) || null;
const customerPhone = sanitizePhone(req.body.customerPhone) || null;
const customerEmail = sanitizeEmail(req.body.customerEmail) || null;
const customerAddress = sanitizeString(req.body.customerAddress, 255) || null;

  const customerPurchaseOrder = sanitizeString(req.body.customerPurchaseOrder, 80) || "N/A";
  const warehouseName = sanitizeString(req.body.warehouseName, 120) || "Principal";
  const issueDate = sanitizeString(req.body.issueDate, 20) || new Date().toISOString().slice(0, 10);
  const deliveryDate =sanitizeString(req.body.deliveryDate, 20) || null;
  const driverName =sanitizeString(req.body.driverName, 120) || null;
  const driverId =sanitizeString(req.body.driverId, 50) || null;
  const vehiclePlate =sanitizeString(req.body.vehiclePlate, 30) || null;
  const deliveryAddress =sanitizeString(req.body.deliveryAddress, 255) || null;
  const deliveryInstructions =sanitizeString(req.body.deliveryInstructions, 1000) || null;
  const sourceType =sanitizeString(req.body.sourceType, 50) || null;
  const sourceId = sanitizeInteger(req.body.sourceId, 0) || null;
  const status =sanitizeString(req.body.status, 30) || "draft";

const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!customerName?.trim()) {
      throw new Error("El cliente es obligatorio");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Debes agregar productos al conduce");
    }

    if (!["draft", "issued"].includes(status)) {
      throw new Error("Estado inválido");
    }

    const normalizedItems = await normalizeItems({
      items,
      tenantId,
      transaction,
      shouldValidateStock: status === "issued",
    });

    const { subtotal, tax, total } = sumTotals(normalizedItems);

    const deliveryNoteNumber = await generateDeliveryNoteNumber(
      tenantId,
      transaction
    );

    const deliveryNote = await DeliveryNote.create(
      {
        tenantId,
        deliveryNoteNumber,
        customerName: customerName.trim(),
        customerRnc,
        customerPhone,
        customerEmail,
        customerAddress,
        customerPurchaseOrder: customerPurchaseOrder || "N/A",
        warehouseName,
        issueDate: cleanDate(issueDate) || new Date().toISOString().slice(0, 10),
        deliveryDate: cleanDate(deliveryDate),
        driverName,
        driverId,
        vehiclePlate,
        deliveryAddress,
        deliveryInstructions,
        sourceType,
        sourceId,
        status,
        subtotal,
        tax,
        total,
        createdBy: userId,
        updatedBy: userId,
      },
      { transaction }
    );

    await saveItems({
      deliveryNote,
      items: normalizedItems,
      tenantId,
      transaction,
    });

    if (status === "issued") {
      await applyStockExit({
        deliveryNote,
        items: normalizedItems,
        tenantId,
        userId,
        transaction,
      });
    }

    await transaction.commit();

    const created = await DeliveryNote.findByPk(deliveryNote.id, {
      include: [{model: DeliveryNoteItem, as: "items", where: { tenantId },required: false,},],
    });

    return res.status(201).json({
      message:
        status === "issued"
          ? "Conduce emitido correctamente"
          : "Borrador guardado correctamente",
      deliveryNote: created,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE DELIVERY NOTE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const issueDeliveryNote = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const { id } = req.params;

    const deliveryNote = await DeliveryNote.findOne({
      where: { id, tenantId },
      include: [{model: DeliveryNoteItem, as: "items", where: { tenantId }, required: false,},],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!deliveryNote) throw new Error("Conduce no encontrado");

    if (deliveryNote.status !== "draft") {
      throw new Error("Solo puedes emitir conduces en borrador");
    }

    const normalizedItems = await normalizeItems({
      items: deliveryNote.items.map((item) => ({
        productId: item.productId,
        requestedQuantity: item.requestedQuantity,
        dispatchedQuantity: item.dispatchedQuantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        description: item.description,
        unit: item.unit,
        isTaxable: item.isTaxable,
      })),
      tenantId,
      transaction,
      shouldValidateStock: true,
    });

    await applyStockExit({
      deliveryNote,
      items: normalizedItems,
      tenantId,
      userId,
      transaction,
    });

    await deliveryNote.update(
      { status: "issued", updatedBy: userId },
      { transaction }
    );

    await transaction.commit();

    return res.json({
      message: "Conduce emitido correctamente",
      deliveryNote,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("ISSUE DELIVERY NOTE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const markDeliveryNoteDelivered = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const receivedByName = sanitizeString(req.body.receivedByName, 120) || null;
    const receivedById =sanitizeString(req.body.receivedById, 50) || null;
    const deliveryNote = await DeliveryNote.findOne({ where: { id, tenantId },});

    if (!deliveryNote) {
      return res.status(404).json({ message: "Conduce no encontrado" });
    }

    if (deliveryNote.status !== "issued") {
      return res.status(400).json({
        message: "Solo puedes marcar como recibido un conduce emitido",
      });
    }

    await deliveryNote.update({
      status: "delivered",
      receivedByName,
      receivedById,
      receivedAt: new Date(),
      updatedBy: userId,
    });

    return res.json({
      message: "Conduce marcado como recibido",
      deliveryNote,
    });
  } catch (error) {
    console.log("MARK DELIVERY NOTE DELIVERED ERROR:", error);
    return res.status(500).json({ message: "Error actualizando conduce" });
  }
};

export const cancelDeliveryNote = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const { id } = req.params;

    const deliveryNote = await DeliveryNote.findOne({
      where: { id, tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!deliveryNote) throw new Error("Conduce no encontrado");

    if (deliveryNote.status === "cancelled") {
      throw new Error("Este conduce ya está anulado");
    }

    if (deliveryNote.invoiceId) {
      throw new Error("No puedes anular un conduce ya facturado");
    }

    if (["issued", "delivered"].includes(deliveryNote.status)) {
      await returnStock({
        deliveryNote,
        tenantId,
        userId,
        transaction,
      });
    }

    await deliveryNote.update(
      { status: "cancelled", updatedBy: userId },
      { transaction }
    );

    await transaction.commit();

    return res.json({
      message: "Conduce anulado correctamente",
      deliveryNote,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CANCEL DELIVERY NOTE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const convertDeliveryNoteToInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const deliveryNote = await DeliveryNote.findOne({
      where: { id, tenantId },
      include: [{model: DeliveryNoteItem, as: "items", where: { tenantId },required: false,},],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!deliveryNote) throw new Error("Conduce no encontrado");

    if (deliveryNote.status === "draft") {
      throw new Error("Primero debes emitir el conduce");
    }

    if (deliveryNote.status === "cancelled") {
      throw new Error("No puedes facturar un conduce anulado");
    }

    if (deliveryNote.invoiceId) {
      throw new Error("Este conduce ya fue facturado");
    }

    const tenant = await Tenant.findByPk(tenantId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!tenant) throw new Error("Empresa no encontrada");

    const invoice = await Invoice.create(
      {
        tenantId,
        invoiceNumber: generateInvoiceNumber(tenant),
        customerName: deliveryNote.customerName,
        customerRnc: deliveryNote.customerRnc,
        customerPhone: deliveryNote.customerPhone,
        customerEmail: deliveryNote.customerEmail,
        subtotal: deliveryNote.subtotal,
        tax: deliveryNote.tax,
        total: deliveryNote.total,
        amountPaid: 0,
        balance: deliveryNote.total,
        status: "draft",
        sourceType: "delivery_note",
        sourceId: deliveryNote.id,
        stockAlreadyMoved: true,
      },
      { transaction }
    );

    await tenant.update(
      {
        invoiceNextNumber: Number(tenant.invoiceNextNumber || 1) + 1,
      },
      { transaction }
    );

    for (const item of deliveryNote.items || []) {
      await InvoiceItem.create(
        {
          tenantId,
          invoiceId: invoice.id,
          productId: item.productId,
          productName: item.productName,
          description: item.description,
          quantity: item.dispatchedQuantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          subtotal: item.subtotal,
          tax: item.tax,
          isTaxable: item.isTaxable,
          taxRate: item.taxRate,
          total: item.total,
        },
        { transaction }
      );
    }

    await deliveryNote.update(
      {
        invoiceId: invoice.id,
        status: "delivered",
      },
      { transaction }
    );

    await transaction.commit();

    const createdInvoice = await Invoice.findByPk(invoice.id, {
      include: [{model: InvoiceItem, as: "items", where: { tenantId }, required: false,},],
    });

    return res.status(201).json({
      message: "Conduce convertido a factura correctamente",
      invoice: createdInvoice,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CONVERT DELIVERY NOTE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const deleteDeliveryNote = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const deliveryNote = await DeliveryNote.findOne({
      where: { id, tenantId },
    });

    if (!deliveryNote) {
      return res.status(404).json({ message: "Conduce no encontrado" });
    }

    if (deliveryNote.status !== "draft") {
      return res.status(400).json({
        message: "Solo puedes eliminar borradores. Para emitidos usa anulación.",
      });
    }

    

    await DeliveryNoteItem.destroy({
      where: { deliveryNoteId: deliveryNote.id, tenantId },
    });

    await deliveryNote.destroy();

    return res.json({ message: "Conduce eliminado correctamente" });
  } catch (error) {
    console.log("DELETE DELIVERY NOTE ERROR:", error);
    return res.status(500).json({ message: "Error eliminando conduce" });
  }
};