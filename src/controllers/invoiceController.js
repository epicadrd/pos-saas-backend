import { Op } from "sequelize";
import {
  sequelize,
  Invoice,
  InvoiceItem,
  Product,
  StockMovement,
  Tenant,
  User,
} from "../models/index.js";
import { logActivity } from "../utils/activityLogger.js";
import {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
  sanitizeNumber,
  sanitizeInteger,
} from "../utils/sanitize.js";

const calculateTotals = (items = [], taxConfig = {}) => {
  let subtotal = 0;
  let tax = 0;

  const defaultTaxRate = Number(taxConfig.defaultTaxRate || 18);
  const taxEnabled = taxConfig.taxEnabled !== false;

  const normalizedItems = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    const discount = Number(item.discount || 0);

    const lineSubtotal = quantity * price;
    const discountAmount = discount > 0 ? discount : 0;
    const taxableBase = Math.max(lineSubtotal - discountAmount, 0);

    const itemTaxEnabled = item.isTaxable !== false && taxEnabled;
    const itemTaxRate = Number(item.taxRate || defaultTaxRate);

    const lineTax = itemTaxEnabled ? taxableBase * (itemTaxRate / 100) : 0;
    const lineTotal = taxableBase + lineTax;

    subtotal += taxableBase;
    tax += lineTax;

    return {
      ...item,
      quantity,
      price,
      discount,
      subtotal: taxableBase,
      taxRate: itemTaxRate,
      isTaxable: itemTaxEnabled,
      total: lineTotal,
    };
  });

  return {
    items: normalizedItems,
    subtotal,
    tax,
    total: subtotal + tax,
  };
};

const generateInvoiceNumber = (tenant) => {
  const prefix = tenant.invoicePrefix || "FAC";
  const nextNumber = Number(tenant.invoiceNextNumber || 1);
  const digits = Number(tenant.invoiceDigits || 6);

  return `${prefix}-${String(nextNumber).padStart(digits, "0")}`;
};

const validateAndNormalizeItems = async ({
  items,
  tenantId,
  transaction,
  shouldValidateStock = true,
  taxConfig = {},
}) => {
  const normalizedItems = [];

  for (const item of items) {
    const productId = item.productId || item.id;
    const quantity = sanitizeInteger(item.quantity);
    const price = sanitizeNumber(item.price ?? item.unitPrice);
    const discount = sanitizeNumber(item.discount);

    if (!productId) throw new Error("Producto inválido en factura");
    if (quantity <= 0) throw new Error("La cantidad debe ser mayor a cero");
    if (price < 0) throw new Error("El precio no puede ser negativo");

    const product = await Product.findOne({
      where: { id: productId, tenantId, isActive: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      throw new Error("Producto no encontrado o no pertenece a esta empresa");
    }

    if (
      shouldValidateStock &&
      product.productType === "product" &&
      product.trackStock &&
      Number(product.stock) < quantity
    ) {
      throw new Error(
        `Stock insuficiente para ${product.name}. Disponible: ${product.stock}`
      );
    }

      const grossSubtotal = quantity * price;
      const discountPercent = Math.min(Math.max(discount, 0), 100);
      const discountAmount = grossSubtotal * (discountPercent / 100);
      const lineSubtotal = Math.max(grossSubtotal - discountAmount, 0);

      const taxEnabled = taxConfig.invoiceTaxEnabled !== false;
      const taxMode = taxConfig.invoiceTaxMode || "global";
      const defaultTaxRate = sanitizeNumber(taxConfig.invoiceTaxRate, 18);

      const isTaxable =
        taxEnabled &&
        (taxMode === "global" ? true : item.isTaxable !== false);

      const taxRate = isTaxable ? defaultTaxRate : 0;
      const lineTax = lineSubtotal * (taxRate / 100);
      const lineTotal = lineSubtotal + lineTax;

    normalizedItems.push({
      product,
      productId: product.id,
      productName: product.name,
      description:sanitizeString(item.description || product.description || "",1000) || null,
      quantity,
      unitPrice: price,
      discount: discountPercent,
      tax: lineTax,
      total: lineTotal,
      subtotal: lineSubtotal,
      isTaxable,
      taxRate,
    });
  }

  return normalizedItems;
};

const saveInvoiceItems = async ({ invoice, items, tenantId, transaction }) => {
  await InvoiceItem.destroy({
    where: { invoiceId: invoice.id, tenantId },
    transaction,
  });

  for (const item of items) {
    await InvoiceItem.create(
      {
        tenantId,
        invoiceId: invoice.id,
        productId: item.productId,
        productName: item.productName,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        tax: item.tax,
        total: item.total,
        subtotal: item.subtotal,
        isTaxable: item.isTaxable,
        taxRate: item.taxRate,
      },
      { transaction }
    );
  }
};

const applyInvoiceStockExit = async ({
  invoice,
  items,
  tenantId,
  userId,
  transaction,
}) => {
  for (const item of items) {
    const product = item.product;

    if (product.productType === "product" && product.trackStock) {
      const previousStock = Number(product.stock);
      const newStock = previousStock - Number(item.quantity);

      await product.update({ stock: newStock }, { transaction });

      await StockMovement.create(
        {
          tenantId,
          productId: product.id,
          userId,
          type: "exit",
          quantity: item.quantity,
          previousStock,
          newStock,
          reason: "Venta por factura",
          referenceType: "invoice",
          referenceId: invoice.id,
          referenceNumber: invoice.invoiceNumber,
        },
        { transaction }
      );
    }
  }
};

export const getInvoices = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const search = sanitizeString(req.query.search || "", 120);
    const status = sanitizeString(req.query.status || "all", 30);

    const where = { tenantId };

    if (status !== "all") where.status = status;

    if (search) {
      where[Op.or] = [
        { invoiceNumber: { [Op.like]: `%${search}%` } },
        { customerName: { [Op.like]: `%${search}%` } },
        { customerRnc: { [Op.like]: `%${search}%` } },
        { customerEmail: { [Op.like]: `%${search}%` } },
      ];
    }

    const invoices = await Invoice.findAll({
      where,
      include: [
        { model: InvoiceItem, as: "items", where: { tenantId }, required: false},
        { model: User, as: "creator", where: { tenantId }, required: false, attributes: ["id", "name", "email", "role"],},
        { model: User, as: "updater", where: { tenantId }, required: false, attributes: ["id", "name", "email", "role"],},
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json(invoices);
  } catch (error) {
    console.log("GET INVOICES ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo facturas" });
  }
};

export const getInvoiceById = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { id, tenantId },
      include: [
    { model: InvoiceItem, as: "items", where: { tenantId }, required: false },
  ],
    });

    if (!invoice) {
      return res.status(404).json({ message: "Factura no encontrada" });
    }

    return res.json(invoice);
  } catch (error) {
    console.log("GET INVOICE BY ID ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo factura" });
  }
};

export const createInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;

    const customerName = sanitizeString(req.body.customerName, 120);
    const customerRnc = sanitizeString(req.body.customerRnc, 30) || null;
    const customerPhone = sanitizePhone(req.body.customerPhone) || null;
    const customerEmail = sanitizeEmail(req.body.customerEmail) || null;
    const items = Array.isArray(req.body.items) ? req.body.items: [];
    const status = sanitizeString(req.body.status, 30) || "issued";
    const amountPaid = sanitizeNumber(req.body.amountPaid);
    const invoiceDate = sanitizeString(req.body.invoiceDate, 20) || null;
    const dueDate = sanitizeString(req.body.dueDate, 20) || null;
    const terms = sanitizeString(req.body.terms, 2000) || null;
    const notes = sanitizeString(req.body.notes, 3000) || null;

    if (!customerName?.trim()) {
      throw new Error("El cliente es obligatorio");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("La factura no tiene productos");
    }

    const validStatuses = ["draft", "issued", "partial", "paid"];

    if (!validStatuses.includes(status)) {
      throw new Error("Estado de factura inválido");
    }

    const isDraft = status === "draft";

    const tenant = await Tenant.findByPk(tenantId, { transaction });

    if (!tenant) {
      throw new Error("Empresa no encontrada");
    }

    const normalizedItems = await validateAndNormalizeItems({
      items,
      tenantId,
      transaction,
      shouldValidateStock: !isDraft,
      taxConfig: tenant,
    });

    const subtotal = normalizedItems.reduce((acc, i) => acc + i.subtotal, 0);
const tax = normalizedItems.reduce((acc, i) => acc + i.tax, 0);
const total = normalizedItems.reduce((acc, i) => acc + i.total, 0);
    const paid = isDraft ? 0 : sanitizeNumber(amountPaid);

    if (paid < 0) throw new Error("El monto pagado no puede ser negativo");
    if (paid > total) throw new Error("El monto pagado no puede ser mayor al total");

    let finalStatus = status;

    if (!isDraft) {
      if (paid >= total && total > 0) finalStatus = "paid";
      else if (paid > 0) finalStatus = "partial";
      else finalStatus = "issued";
    }

    const invoice = await Invoice.create(
      {
        tenantId,
        invoiceNumber: generateInvoiceNumber(tenant),
        customerName: customerName.trim(),
        customerRnc,
        customerPhone,
        customerEmail,
        subtotal,
        tax,
        total,
        amountPaid: paid,
        balance: total - paid,
        status: finalStatus,
        stockAlreadyMoved: false,
        invoiceDate,
        dueDate,
        terms,
        notes,
        createdBy: userId,
        updatedBy: userId,
      },
      { transaction }
    );

    await logActivity({
      tenantId,
      userId,
      module: "invoices",
      action: "CREATE_INVOICE",
      description: `${req.user.email} creó la factura ${invoice.invoiceNumber}`,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total,
      },
      transaction,
    });

    await tenant.update(
      {
        invoiceNextNumber: Number(tenant.invoiceNextNumber || 1) + 1,
      },
      { transaction }
    );

    await saveInvoiceItems({
      invoice,
      items: normalizedItems,
      tenantId,
      transaction,
    });

    if (!isDraft) {
      await applyInvoiceStockExit({
        invoice,
        items: normalizedItems,
        tenantId,
        userId,
        transaction,
      });
    }

    await transaction.commit();

    return res.status(201).json({
      message: isDraft
        ? "Borrador guardado correctamente"
        : "Factura creada correctamente",
      invoice,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE INVOICE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const updateDraftInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user?.id || null;
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { id, tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!invoice) throw new Error("Factura no encontrada");

    if (invoice.status !== "draft") {
      throw new Error("Solo puedes editar facturas en borrador");
    }

    const customerName = sanitizeString(req.body.customerName, 120);
    const customerRnc = sanitizeString(req.body.customerRnc, 30) || null;
    const customerPhone = sanitizePhone(req.body.customerPhone) || null;
    const customerEmail = sanitizeEmail(req.body.customerEmail) || null;
    const invoiceDate = sanitizeString(req.body.invoiceDate, 20) || null;
    const dueDate = sanitizeString(req.body.dueDate, 20) || null;
    const terms = sanitizeString(req.body.terms, 2000) || null;
    const notes = sanitizeString(req.body.notes, 3000) || null;
    const items = Array.isArray(req.body.items) ? req.body.items: [];

    if (!customerName?.trim()) {
      throw new Error("El cliente es obligatorio");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("El borrador no tiene productos");
    }

    const tenant = await Tenant.findByPk(tenantId, { transaction });

    if (!tenant) {
      throw new Error("Empresa no encontrada");
    }

    const normalizedItems = await validateAndNormalizeItems({
      items,
      tenantId,
      transaction,
      shouldValidateStock: false,
      taxConfig: tenant,
    });

    const subtotal = normalizedItems.reduce(
      (acc, item) => acc + Number(item.subtotal || 0),
      0
    );

    const tax = normalizedItems.reduce(
      (acc, item) => acc + Number(item.tax || 0),
      0
    );

    const total = normalizedItems.reduce(
      (acc, item) => acc + Number(item.total || 0),
      0
    );

    await invoice.update(
      {
        customerName: customerName.trim(),
        customerRnc,
        customerPhone,
        customerEmail,
        subtotal,
        tax,
        total,
        amountPaid: 0,
        balance: total,
        status: "draft",
        invoiceDate,
        dueDate,
        terms,
        notes,
        updatedBy: userId,
      },
      { transaction }
    );

    await saveInvoiceItems({
      invoice,
      items: normalizedItems,
      tenantId,
      transaction,
    });

    await transaction.commit();

    return res.json({
      message: "Borrador actualizado correctamente",
      invoice,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("UPDATE DRAFT INVOICE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const issueDraftInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const amountPaid = sanitizeNumber(req.body.amountPaid);

    const invoice = await Invoice.findOne({
      where: { id, tenantId },
      include: [
      {model: InvoiceItem, as: "items", where: { tenantId },required: false,},],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!invoice) throw new Error("Factura no encontrada");

    if (invoice.status !== "draft") {
      throw new Error("Solo puedes emitir facturas en borrador");
    }

    if (!invoice.items || invoice.items.length === 0) {
      throw new Error("Este borrador no tiene productos");
    }

    const tenant = await Tenant.findByPk(tenantId, { transaction });

    if (!tenant) {
      throw new Error("Empresa no encontrada");
    }

    const itemsForValidation = invoice.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.unitPrice,
      discount: item.discount,
      description: item.description,
      isTaxable: item.isTaxable,
    }));

    const normalizedItems = await validateAndNormalizeItems({
      items: itemsForValidation,
      tenantId,
      transaction,
      shouldValidateStock: true,
      taxConfig: tenant
    });

    const paid = sanitizeNumber(amountPaid);

    if (paid < 0) throw new Error("El monto pagado no puede ser negativo");
    if (paid > Number(invoice.total)) {
      throw new Error("El monto pagado no puede ser mayor al total");
    }

    let finalStatus = "issued";
    if (paid >= Number(invoice.total) && Number(invoice.total) > 0) {
      finalStatus = "paid";
    } else if (paid > 0) {
      finalStatus = "partial";
    }

    if (!invoice.stockAlreadyMoved) {
    await applyInvoiceStockExit({
      invoice,
      items: normalizedItems,
      tenantId,
      userId,
      transaction,
    });
  }

    await invoice.update(
      {
        status: finalStatus,
        amountPaid: paid,
        balance: Number(invoice.total) - paid,
        updatedBy: userId,
      },
      { transaction }
    );

    await transaction.commit();

    return res.json({
      message: "Borrador emitido correctamente",
      invoice,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("ISSUE DRAFT INVOICE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const cancelInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user?.id || null;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { id, tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!invoice) throw new Error("Factura no encontrada");

    if (invoice.status === "cancelled") {
      throw new Error("Esta factura ya está anulada");
    }

    if (invoice.status === "draft") {
      throw new Error("Los borradores no se anulan, se eliminan");
    }

    const exitMovements = await StockMovement.findAll({
      where: {
        tenantId,
        referenceType: "invoice",
        referenceId: invoice.id,
        type: "exit",
      },
      transaction,
    });

    for (const movement of exitMovements) {
      const product = await Product.findOne({
        where: { id: movement.productId, tenantId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!product) continue;

      const previousStock = Number(product.stock);
      const newStock = previousStock + Number(movement.quantity);

      await product.update({ stock: newStock }, { transaction });

      await StockMovement.create(
        {
          tenantId,
          productId: product.id,
          userId,
          type: "return",
          quantity: Number(movement.quantity),
          previousStock,
          newStock,
          reason: "Anulación de factura",
          referenceType: "invoice",
          referenceId: invoice.id,
          referenceNumber: invoice.invoiceNumber,
        },
        { transaction }
      );
    }

    await invoice.update(
      {
        status: "cancelled",
        balance: 0,
        updatedBy: userId,
      },
      { transaction }
    );

    await transaction.commit();

    return res.json({
      message: "Factura anulada correctamente",
      invoice,
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CANCEL INVOICE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const deleteInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { id, tenantId },
      transaction,
    });

    if (!invoice) throw new Error("Factura no encontrada");

    if (invoice.status !== "draft") {
      throw new Error(
        "Solo se pueden eliminar borradores. Para facturas emitidas usa anulación."
      );
    }

    await InvoiceItem.destroy({
      where: { invoiceId: invoice.id, tenantId },
      transaction,
    });

    await invoice.destroy({ transaction });

    await transaction.commit();

    return res.json({ message: "Borrador eliminado correctamente" });
  } catch (error) {
    await transaction.rollback();
    console.log("DELETE INVOICE ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const markInvoiceAsPaid = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { id, tenantId },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Factura no encontrada" });
    }

    if (invoice.status === "cancelled") {
      return res.status(400).json({ message: "No puedes pagar una factura anulada" });
    }

    if (invoice.status === "draft") {
      return res.status(400).json({ message: "Primero debes emitir el borrador" });
    }

    await invoice.update({
      status: "paid",
      amountPaid: invoice.total,
      balance: 0,
      updatedBy: userId,
    });

    return res.json({
      message: "Factura marcada como pagada",
      invoice,
    });
  } catch (error) {
    console.log("MARK INVOICE AS PAID ERROR:", error);
    return res.status(500).json({ message: "Error marcando factura como pagada" });
  }
};