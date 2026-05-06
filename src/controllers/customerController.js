import { Op } from "sequelize";
import { Customer } from "../models/index.js";

export const getCustomers = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { search = "", status = "active" } = req.query;

    const where = { tenantId };

    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { rnc: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const customers = await Customer.findAll({
      where,
      order: [["name", "ASC"]],
    });

    return res.json(customers);
  } catch (error) {
    console.log("GET CUSTOMERS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo clientes" });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, rnc, phone, email, address } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "El nombre del cliente es obligatorio" });
    }

    if (rnc) {
      const exists = await Customer.findOne({
        where: { tenantId, rnc, isActive: true },
      });

      if (exists) {
        return res.status(400).json({ message: "Ya existe un cliente con este RNC/Cédula" });
      }
    }

    const customer = await Customer.create({
      tenantId,
      name: name.trim(),
      rnc: rnc || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
    });

    return res.status(201).json({
      message: "Cliente creado correctamente",
      customer,
    });
  } catch (error) {
    console.log("CREATE CUSTOMER ERROR:", error);
    return res.status(500).json({ message: "Error creando cliente" });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;
    const { name, rnc, phone, email, address } = req.body;

    const customer = await Customer.findOne({
      where: { id, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    if (!name?.trim()) {
      return res.status(400).json({ message: "El nombre del cliente es obligatorio" });
    }

    if (rnc) {
      const exists = await Customer.findOne({
        where: {
          tenantId,
          rnc,
          isActive: true,
          id: { [Op.ne]: id },
        },
      });

      if (exists) {
        return res.status(400).json({ message: "Ya existe otro cliente con este RNC/Cédula" });
      }
    }

    await customer.update({
      name: name.trim(),
      rnc: rnc || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
    });

    return res.json({
      message: "Cliente actualizado correctamente",
      customer,
    });
  } catch (error) {
    console.log("UPDATE CUSTOMER ERROR:", error);
    return res.status(500).json({ message: "Error actualizando cliente" });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const customer = await Customer.findOne({
      where: { id, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    await customer.update({ isActive: false });

    return res.json({ message: "Cliente desactivado correctamente" });
  } catch (error) {
    console.log("DELETE CUSTOMER ERROR:", error);
    return res.status(500).json({ message: "Error desactivando cliente" });
  }
};

import {
  sequelize,
  DeliveryNote,
  DeliveryNoteItem,
  Product,
  StockMovement,
  Tenant,
  Invoice,
  InvoiceItem,
  Quote,
  QuoteItem,
} from "../models/index.js";

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toInteger = (value, fallback = 0) => {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
};

const generateDeliveryNoteNumber = (tenant) => {
  const prefix = tenant.deliveryNotePrefix || "CON";
  const nextNumber = Number(tenant.deliveryNoteNextNumber || 1);
  const digits = Number(tenant.deliveryNoteDigits || 6);

  return `${prefix}-${String(nextNumber).padStart(digits, "0")}`;
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
  tenant,
  transaction,
  shouldValidateStock = false,
}) => {
  const normalized = [];

  for (const item of items) {
    const productId = item.productId || item.id;
    const requestedQuantity = toInteger(item.requestedQuantity || item.quantity, 1);
    const dispatchedQuantity = toInteger(
      item.dispatchedQuantity || item.quantity,
      requestedQuantity
    );
    const unitPrice = toNumber(item.unitPrice ?? item.price, 0);
    const discount = toNumber(item.discount, 0);

    if (!productId) throw new Error("Producto inválido en conduce");
    if (requestedQuantity <= 0) throw new Error("La cantidad solicitada debe ser mayor a cero");
    if (dispatchedQuantity <= 0) throw new Error("La cantidad despachada debe ser mayor a cero");
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

    const taxEnabled = tenant.invoiceTaxEnabled !== false;
    const taxMode = tenant.invoiceTaxMode || "global";
    const defaultTaxRate = toNumber(tenant.invoiceTaxRate, 18);

    const isTaxable =
      taxEnabled && (taxMode === "global" ? true : item.isTaxable !== false);

    const taxRate = isTaxable ? defaultTaxRate : 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    normalized.push({
      product,
      productId: product.id,
      productName: product.name,
      description: item.description || product.description || product.name,
      unit: item.unit || product.unit || "UND",
      requestedQuantity,
      dispatchedQuantity,
      unitPrice,
      discount: discountPercent,
      subtotal,
      tax,
      total,
      isTaxable,
      taxRate,
    });
  }

  return normalized;
};

const sumTotals = (items) => {
  const subtotal = items.reduce((acc, item) => acc + Number(item.subtotal || 0), 0);
  const tax = items.reduce((acc, item) => acc + Number(item.tax || 0), 0);
  const total = items.reduce((acc, item) => acc + Number(item.total || 0), 0);

  return { subtotal, tax, total };
};

const saveDeliveryNoteItems = async ({
  deliveryNote,
  items,
  tenantId,
  transaction,
}) => {
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

const returnStockFromDeliveryNote = async ({
  deliveryNote,
  tenantId,
  userId,
  transaction,
}) => {
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
      include: [{ model: DeliveryNoteItem, as: "items" }],
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
      include: [{ model: DeliveryNoteItem, as: "items" }],
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

    const {
      customerName,
      customerRnc = null,
      customerPhone = null,
      customerEmail = null,
      customerAddress = null,
      customerPurchaseOrder,
      warehouseName = "Principal",
      issueDate = new Date().toISOString().slice(0, 10),
      deliveryDate = null,
      driverName = null,
      driverId = null,
      vehiclePlate = null,
      deliveryAddress = null,
      deliveryInstructions = null,
      sourceType = null,
      sourceId = null,
      status = "draft",
      items = [],
    } = req.body;

    if (!customerName?.trim()) throw new Error("El cliente es obligatorio");
    if (!customerPurchaseOrder?.trim()) {
      throw new Error("La orden de compra del cliente es obligatoria");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Debes agregar productos al conduce");
    }

    const validStatuses = ["draft", "issued"];
    if (!validStatuses.includes(status)) {
      throw new Error("Estado inválido");
    }

    const tenant = await Tenant.findByPk(tenantId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!tenant) throw new Error("Empresa no encontrada");

    const isIssued = status === "issued";

    const normalizedItems = await normalizeItems({
      items,
      tenantId,
      tenant,
      transaction,
      shouldValidateStock: isIssued,
    });

    const { subtotal, tax, total } = sumTotals(normalizedItems);

    const deliveryNote = await DeliveryNote.create(
      {
        tenantId,
        deliveryNoteNumber: generateDeliveryNoteNumber(tenant),
        customerName: customerName.trim(),
        customerRnc,
        customerPhone,
        customerEmail,
        customerAddress,
        customerPurchaseOrder,
        warehouseName,
        issueDate,
        deliveryDate,
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
      },
      { transaction }
    );

    await tenant.update(
      {
        deliveryNoteNextNumber: Number(tenant.deliveryNoteNextNumber || 1) + 1,
      },
      { transaction }
    );

    await saveDeliveryNoteItems({
      deliveryNote,
      items: normalizedItems,
      tenantId,
      transaction,
    });

    if (isIssued) {
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
      include: [{ model: DeliveryNoteItem, as: "items" }],
    });

    return res.status(201).json({
      message: isIssued
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

export const createDeliveryNoteFromQuote = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const { quoteId } = req.params;
    const { customerPurchaseOrder, warehouseName = "Principal" } = req.body;

    if (!customerPurchaseOrder?.trim()) {
      throw new Error("La orden de compra del cliente es obligatoria");
    }

    const quote = await Quote.findOne({
      where: { id: quoteId, tenantId },
      include: [{ model: QuoteItem, as: "items" }],
      transaction,
    });

    if (!quote) throw new Error("Cotización no encontrada");

    const tenant = await Tenant.findByPk(tenantId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const deliveryNote = await DeliveryNote.create(
      {
        tenantId,
        deliveryNoteNumber: generateDeliveryNoteNumber(tenant),
        customerName: quote.customerName,
        customerRnc: quote.customerRnc,
        customerPhone: quote.customerPhone,
        customerEmail: quote.customerEmail,
        customerPurchaseOrder,
        warehouseName,
        sourceType: "quote",
        sourceId: quote.id,
        status: "draft",
        issueDate: new Date().toISOString().slice(0, 10),
        subtotal: quote.subtotal,
        tax: quote.tax,
        total: quote.total,
      },
      { transaction }
    );

    await tenant.update(
      {
        deliveryNoteNextNumber: Number(tenant.deliveryNoteNextNumber || 1) + 1,
      },
      { transaction }
    );

    for (const item of quote.items || []) {
      await DeliveryNoteItem.create(
        {
          tenantId,
          deliveryNoteId: deliveryNote.id,
          productId: item.productId,
          productName: item.productName,
          description: item.description,
          unit: "UND",
          requestedQuantity: item.quantity,
          dispatchedQuantity: item.quantity,
          unitPrice: item.price,
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

    await transaction.commit();

    const created = await DeliveryNote.findByPk(deliveryNote.id, {
      include: [{ model: DeliveryNoteItem, as: "items" }],
    });

    return res.status(201).json({
      message: "Conduce creado desde cotización",
      deliveryNote: created,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE DELIVERY NOTE FROM QUOTE ERROR:", error);
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
      include: [{ model: DeliveryNoteItem, as: "items" }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!deliveryNote) throw new Error("Conduce no encontrado");
    if (deliveryNote.status !== "draft") {
      throw new Error("Solo puedes emitir conduces en borrador");
    }

    const tenant = await Tenant.findByPk(tenantId, { transaction });

    const itemsForValidation = deliveryNote.items.map((item) => ({
      productId: item.productId,
      requestedQuantity: item.requestedQuantity,
      dispatchedQuantity: item.dispatchedQuantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      description: item.description,
      isTaxable: item.isTaxable,
    }));

    const normalizedItems = await normalizeItems({
      items: itemsForValidation,
      tenantId,
      tenant,
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

    await deliveryNote.update({ status: "issued" }, { transaction });

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
    const { id } = req.params;
    const { receivedByName = null, receivedById = null } = req.body;

    const deliveryNote = await DeliveryNote.findOne({
      where: { id, tenantId },
    });

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

    if (deliveryNote.status === "issued" || deliveryNote.status === "delivered") {
      await returnStockFromDeliveryNote({
        deliveryNote,
        tenantId,
        userId,
        transaction,
      });
    }

    await deliveryNote.update({ status: "cancelled" }, { transaction });

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
      include: [{ model: DeliveryNoteItem, as: "items" }],
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
      include: [{ model: InvoiceItem, as: "items" }],
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