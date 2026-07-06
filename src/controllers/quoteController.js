import { Op } from "sequelize";
import {
  Quote,
  QuoteItem,
  Product,
  Invoice,
  InvoiceItem,
  Tenant,
  sequelize,
  User
} from "../models/index.js";
import {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
  sanitizeNumber,
  sanitizeInteger,
} from "../utils/sanitize.js";

const generateQuoteNumber = async (tenantId, transaction) => {
  const count = await Quote.count({
    where: { tenantId },
    transaction,
  });

  return `COT-${String(count + 1).padStart(6, "0")}`;
};

const generateInvoiceNumber = (tenant) => {
  const prefix = tenant.invoicePrefix || "FAC";
  const nextNumber = Number(tenant.invoiceNextNumber || 1);
  const digits = Number(tenant.invoiceDigits || 6);

  return `${prefix}-${String(nextNumber).padStart(digits, "0")}`;
};

const getTodayDateOnly = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const normalizeDateOnly = (value) => {
  if (!value) return null;
  return String(value).slice(0, 10);
};


const getEffectiveStatus = (quote) => {
  const validUntil = normalizeDateOnly(quote.validUntil);

  if (!validUntil) {
    return quote.status;
  }

  const today = getTodayDateOnly();

  if (
    quote.status !== "converted" &&
    quote.status !== "approved" &&
    quote.status !== "rejected" &&
    validUntil < today
  ) {
    return "expired";
  }

  return quote.status;
};

const normalizeQuoteItems = async ({ items, tenantId, taxConfig = {}, transaction }) => {
  const normalizedItems = [];

  for (const item of items) {
    const productId = item.productId || item.id || null;
    const quantity = sanitizeInteger(item.quantity, 1);
    const price = sanitizeNumber(item.price ?? item.unitPrice, 0);
    const discount = sanitizeNumber(item.discount, 0);

    if (quantity <= 0) throw new Error("La cantidad debe ser mayor a cero");
    if (price < 0) throw new Error("El precio no puede ser negativo");
    if (discount < 0 || discount > 100) {
      throw new Error("El descuento debe estar entre 0 y 100");
    }

    let product = null

    if (productId) {
      product = await Product.findOne({
        where: { id: productId, tenantId, isActive: true },
        transaction,
      });

      if (!product) {
        throw new Error("Producto no encontrado o no pertenece a esta empresa");
      }
    }

    const productName = item.productName || product?.name;

    if (!productName?.trim()) {
      throw new Error("El nombre del producto es obligatorio");
    }

    const grossSubtotal = quantity * price;
    const discountAmount = grossSubtotal * (discount / 100);
    const subtotal = Math.max(grossSubtotal - discountAmount, 0);

    const taxEnabled = taxConfig.invoiceTaxEnabled !== false;
    const taxMode = taxConfig.invoiceTaxMode || "global";
    const defaultTaxRate = sanitizeNumber(
      taxConfig.invoiceTaxRate,
      18
    );

    const isTaxable =
      taxEnabled && (taxMode === "global" ? true : item.isTaxable !== false);

    const taxRate = isTaxable ? defaultTaxRate : 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    normalizedItems.push({
      product,
      productId: product?.id || null,
      productName: productName.trim(),
      description:
      sanitizeString(item.description || product?.description || "",1000) || null,
      quantity,
      price,
      discount,
      subtotal,
      tax,
      isTaxable,
      taxRate,
      total,
    });
  }

  return normalizedItems;
};

const sumTotals = (items) => {
  const subtotal = items.reduce((acc, item) => acc + Number(item.subtotal || 0), 0);
  const tax = items.reduce((acc, item) => acc + Number(item.tax || 0), 0);
  const total = items.reduce((acc, item) => acc + Number(item.total || 0), 0);

  return { subtotal, tax, total };
};

export const getQuotes = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const search = sanitizeString(req.query.search || "", 120);
    const status = sanitizeString(req.query.status || "all", 30);
    const where = { tenantId };

    if (status !== "all") where.status = status;

    if (search) {
      where[Op.or] = [
        { quoteNumber: { [Op.like]: `%${search}%` } },
        { customerName: { [Op.like]: `%${search}%` } },
        { customerRnc: { [Op.like]: `%${search}%` } },
        { customerEmail: { [Op.like]: `%${search}%` } },
      ];
    }

    const quotes = await Quote.findAll({
      where,
      include: [
      {model: QuoteItem, as: "items", where: { tenantId }, required: false,},
      {model: User, as: "creator", where: { tenantId }, required: false, attributes: ["id", "name", "email", "role"],},
      {model: User, as: "updater", where: { tenantId }, required: false, attributes: ["id", "name", "email", "role"],},
     ],
      order: [["createdAt", "DESC"]],
    });

    return res.json(
      quotes.map((quote) => ({
        ...quote.toJSON(),
        effectiveStatus: getEffectiveStatus(quote),
      }))
    );
  } catch (error) {
    console.log("GET QUOTES ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo cotizaciones" });
  }
};

export const getQuoteById = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const quote = await Quote.findOne({
      where: { id, tenantId },
      include: [{model: QuoteItem,as: "items",where: { tenantId },required: false,},],
    });

    if (!quote) {
      return res.status(404).json({ message: "Cotización no encontrada" });
    }

    return res.json({
      ...quote.toJSON(),
      effectiveStatus: getEffectiveStatus(quote),
    });
  } catch (error) {
    console.log("GET QUOTE ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo cotización" });
  }
};

export const createQuote = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const customerName = sanitizeString(req.body.customerName, 120);
    const customerRnc = sanitizeString(req.body.customerRnc, 30) || null;
    const customerPhone = sanitizePhone(req.body.customerPhone) || null;
    const customerEmail = sanitizeEmail(req.body.customerEmail) || null;
    const validUntil = sanitizeString(req.body.validUntil, 20) || null;
    const notes = sanitizeString(req.body.notes, 3000) || null;
    const status = sanitizeString(req.body.status, 30) || "draft";
    const items = Array.isArray(req.body.items)? req.body.items: [];

    if (!customerName?.trim()) {
      throw new Error("El nombre del cliente es obligatorio");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Debes agregar al menos un producto o servicio");
    }

    const validStatuses = ["draft", "sent", "approved", "rejected"];

    if (!validStatuses.includes(status)) {
      throw new Error("Estado de cotización inválido");
    }

    const tenant = await Tenant.findByPk(tenantId, { transaction });

    if (!tenant) {
      throw new Error("Empresa no encontrada");
    }

    const formattedItems = await normalizeQuoteItems({
      items,
      tenantId,
      taxConfig: tenant,
      transaction,
    });

    const { subtotal, tax, total } = sumTotals(formattedItems);
    const quoteNumber = await generateQuoteNumber(tenantId, transaction);

    const quote = await Quote.create(
      {
        tenantId,
        quoteNumber,
        customerName: customerName.trim(),
        customerRnc,
        customerPhone,
        customerEmail,
        validUntil: validUntil || null,
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
      await QuoteItem.create(
        {
          tenantId,
          quoteId: quote.id,
          productId: item.productId,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          price: item.price,
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

    await transaction.commit();

    const createdQuote = await Quote.findByPk(quote.id, {
      include: [
        {
          model: QuoteItem,
          as: "items",
          where: { tenantId },
          required: false,
        },
      ],
    });

    return res.status(201).json({
      message: "Cotización creada correctamente",
      quote: createdQuote,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE QUOTE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const updateQuoteStatus = async (req, res) => {
  try {
  const tenantId = req.user.tenantId;
  const userId = req.user?.id || null;
  const { id } = req.params;
  const status = sanitizeString(req.body.status, 30);
  const validStatuses = ["draft", "sent", "approved", "rejected"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Estado de cotización inválido" });
    }

    const quote = await Quote.findOne({
      where: { id, tenantId },
    });

    if (!quote) {
      return res.status(404).json({ message: "Cotización no encontrada" });
    }

    if (quote.status === "converted") {
      return res.status(400).json({
        message: "No puedes cambiar una cotización ya convertida",
      });
    }

    await quote.update({ status, updatedBy: userId });

    return res.json({
      message: "Estado actualizado correctamente",
      quote,
    });
  } catch (error) {
    console.log("UPDATE QUOTE STATUS ERROR:", error);
    return res.status(500).json({ message: "Error actualizando estado" });
  }
};

export const convertQuoteToInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user?.id || null;
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const quote = await Quote.findOne({
      where: { id, tenantId },
      include: [
      {model: QuoteItem,as: "items", where: { tenantId },required: false,},],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!quote) {
      throw new Error("Cotización no encontrada");
    }

    if (quote.status === "converted") {
      throw new Error("Esta cotización ya fue convertida a factura");
    }

    if (getEffectiveStatus(quote) === "expired") {
      throw new Error("No puedes convertir una cotización vencida");
    }

    if (!quote.items || quote.items.length === 0) {
      throw new Error("La cotización no tiene productos o servicios");
    }

    const tenant = await Tenant.findByPk(tenantId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!tenant) {
      throw new Error("Empresa no encontrada");
    }

    const invoice = await Invoice.create(
      {
        tenantId,
        invoiceNumber: generateInvoiceNumber(tenant),
        customerName: quote.customerName,
        customerRnc: quote.customerRnc,
        customerPhone: quote.customerPhone,
        customerEmail: quote.customerEmail,
        subtotal: quote.subtotal,
        tax: quote.tax,
        total: quote.total,
        amountPaid: 0,
        balance: quote.total,
        status: "draft",
        createdBy: userId, 
        updatedBy: userId,
      },
      { transaction }
    );

    await tenant.update(
      {
        invoiceNextNumber: Number(tenant.invoiceNextNumber || 1) + 1,
      },
      { transaction }
    );

    for (const item of quote.items) {
      await InvoiceItem.create(
        {
          tenantId,
          invoiceId: invoice.id,
          productId: item.productId,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.price,
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

    await quote.update(
      { status: "converted", updatedBy: userId },
      { transaction }
    );

    await transaction.commit();

    const createdInvoice = await Invoice.findByPk(invoice.id, {
      include: [
      {model: InvoiceItem, as: "items", where: { tenantId },required: false,},],
    });

    return res.status(201).json({
      message: "Cotización convertida a factura correctamente",
      invoice: createdInvoice,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CONVERT QUOTE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const updateQuote = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user?.id || null;
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const quote = await Quote.findOne({
      where: { id, tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!quote) throw new Error("Cotización no encontrada");

    if (quote.status === "converted") {
      throw new Error("No puedes editar una cotización convertida");
    }

    const customerName = sanitizeString(req.body.customerName, 120);
    const customerRnc = sanitizeString(req.body.customerRnc, 30) || null;
    const customerPhone = sanitizePhone(req.body.customerPhone) || null;
    const customerEmail = sanitizeEmail(req.body.customerEmail) || null;
    const validUntil = sanitizeString(req.body.validUntil, 20) || null;
    const notes = sanitizeString(req.body.notes, 3000) || null;
    const status = sanitizeString(req.body.status, 30) || quote.status;
    const items = Array.isArray(req.body.items)? req.body.items: [];

    if (!customerName?.trim()) {
      throw new Error("El nombre del cliente es obligatorio");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Debes agregar al menos un producto o servicio");
    }

    const tenant = await Tenant.findByPk(tenantId, { transaction });

    const formattedItems = await normalizeQuoteItems({
      items,
      tenantId,
      taxConfig: tenant,
      transaction,
    });

    const { subtotal, tax, total } = sumTotals(formattedItems);

    await quote.update(
      {
        customerName: customerName.trim(),
        customerRnc,
        customerPhone,
        customerEmail,
        validUntil: validUntil || null,
        subtotal,
        tax,
        total,
        notes,
        status,
        updatedBy: userId,
      },
      { transaction }
    );

    await QuoteItem.destroy({
      where: { quoteId: quote.id, tenantId },
      transaction,
    });

    for (const item of formattedItems) {
      await QuoteItem.create(
        {
          tenantId,
          quoteId: quote.id,
          productId: item.productId,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          price: item.price,
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

    await transaction.commit();

    const updatedQuote = await Quote.findByPk(quote.id, {
      include: [{model: QuoteItem, as: "items", where: { tenantId },required: false,},],
    });

    return res.json({
      message: "Cotización actualizada correctamente",
      quote: updatedQuote,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("UPDATE QUOTE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const deleteQuote = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const quote = await Quote.findOne({
      where: { id, tenantId },
      transaction,
    });

    if (!quote) {
      throw new Error("Cotización no encontrada");
    }

    if (quote.status === "converted") {
      throw new Error("No puedes eliminar una cotización convertida");
    }

    await QuoteItem.destroy({
      where: { quoteId: quote.id, tenantId },
      transaction,
    });

    await quote.destroy({ transaction });

    await transaction.commit();

    return res.json({ message: "Cotización eliminada correctamente" });
  } catch (error) {
    await transaction.rollback();
    console.log("DELETE QUOTE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};