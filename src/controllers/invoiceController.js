import { Op } from "sequelize";
import {
  sequelize,
  Invoice,
  InvoiceItem,
  Product,
  StockMovement,
  Tenant,
  User,
  ElectronicInvoice,
  FiscalNumberUsage,
  FiscalSequence,
} from "../models/index.js";
import { logActivity } from "../utils/activityLogger.js";
import { resolveCustomerId } from "../services/customerLinkService.js";
import { getActiveFiscalUsage } from "../services/ecfEmissionService.js";
import { voidFiscalNumber } from "../services/fiscalSequenceService.js";
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

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const validateAndNormalizeItems = async ({
  items,
  tenantId,
  transaction,
  shouldValidateStock = true,
  taxConfig = {},
}) => {
  const normalizedItems = [];

  for (const item of items) {
    const productId = item.productId || item.id || null;
    const quantity = sanitizeInteger(item.quantity);
    const price = sanitizeNumber(item.price ?? item.unitPrice);
    const discountAmount = sanitizeNumber(item.discount);

    if (quantity <= 0) throw new Error("La cantidad debe ser mayor a cero");
    if (price < 0) throw new Error("El precio no puede ser negativo");
    if (discountAmount < 0) throw new Error("El descuento no puede ser negativo");

    let product = null;

    if (productId) {
      product = await Product.findOne({
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
    }

    const manualName = sanitizeString(
      item.productName || item.description || "",
      300
    );

    if (!product && !manualName) {
      throw new Error("Debes escribir el producto o servicio de la factura");
    }

    const grossSubtotal = roundMoney(quantity * price);
    const safeDiscount = Math.min(discountAmount, grossSubtotal);
    const lineSubtotal = roundMoney(grossSubtotal - safeDiscount);

    const taxEnabled = taxConfig.invoiceTaxEnabled !== false;
    const taxMode = taxConfig.invoiceTaxMode || "global";
    const defaultTaxRate = sanitizeNumber(taxConfig.invoiceTaxRate, 18);

    const isTaxable =
      taxEnabled &&
      (taxMode === "global" ? true : item.isTaxable !== false);

    const taxRate = isTaxable ? defaultTaxRate : 0;
    const lineTax = roundMoney(lineSubtotal * (taxRate / 100));
    const lineTotal = roundMoney(lineSubtotal + lineTax);

    normalizedItems.push({
      product,
      productId: product?.id || null,
      productName: product?.name || manualName,
      description:
        sanitizeString(item.description || product?.description || "", 1000) ||
        null,
      quantity,
      unitPrice: roundMoney(price),
      discount: roundMoney(safeDiscount),
      subtotal: lineSubtotal,
      tax: lineTax,
      total: lineTotal,
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
    if (!product) continue;

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

/*
 * Datos de la e-CF que exige la representación impresa: código de
 * seguridad, fecha de firma y vencimiento de la secuencia del e-NCF.
 */
const INVOICE_TYPES = [
  "consumer_final",
  "credit_fiscal",
  "special_regime",
  "government",
];

// USD queda desactivado hasta que reportes y cuentas por cobrar conviertan a pesos
export const INVOICE_CURRENCIES = ["DOP"];

// En USD la tasa es obligatoria para poder enviar el e-CF en pesos
const parseInvoiceCurrency = (body) => {
  const currency = INVOICE_CURRENCIES.includes(body.currency) ? body.currency : "DOP";

  if (currency === "DOP") return { currency, exchangeRate: null };

  const rate = Number(body.exchangeRate);
  const exchangeRate =
    Number.isFinite(rate) && rate > 0 && rate < 1000
      ? Math.round(rate * 10000) / 10000
      : null;

  return { currency, exchangeRate };
};

// Las ventas a regímenes especiales (E44) van exentas de ITBIS
const getInvoiceTaxConfig = (tenant, invoiceType) =>
  invoiceType === "special_regime"
    ? { ...tenant.toJSON(), invoiceTaxEnabled: false }
    : tenant;

export const attachEcfPrintData = async (tenantId, invoices) => {
  const withNumber = invoices.filter((invoice) => invoice.eNcf);
  if (!withNumber.length) return invoices.map((invoice) => invoice.toJSON());

  const [electronicInvoices, usages] = await Promise.all([
    ElectronicInvoice.findAll({
      where: { tenantId, invoiceId: withNumber.map((invoice) => invoice.id) },
      attributes: ["invoiceId", "eNcf", "securityCode", "signedDate"],
    }),
    FiscalNumberUsage.findAll({
      where: {
        tenantId,
        documentType: "invoice",
        documentId: withNumber.map((invoice) => invoice.id),
        status: { [Op.ne]: "VOIDED" },
      },
      attributes: ["documentId", "eNcf"],
      include: [{ model: FiscalSequence, as: "sequence", attributes: ["expirationDate"] }],
    }),
  ]);

  return invoices.map((invoice) => {
    const data = invoice.toJSON();
    if (!invoice.eNcf) return data;

    const electronic = electronicInvoices.find(
      (row) => row.invoiceId === invoice.id && row.eNcf === invoice.eNcf
    );
    const usage = usages.find(
      (row) => row.documentId === invoice.id && row.eNcf === invoice.eNcf
    );

    return {
      ...data,
      securityCode: electronic?.securityCode || null,
      signedDate: electronic?.signedDate || null,
      sequenceExpirationDate: usage?.sequence?.expirationDate || null,
    };
  });
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

    return res.json(await attachEcfPrintData(tenantId, invoices));
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

    const [withEcfData] = await attachEcfPrintData(tenantId, [invoice]);

    return res.json(withEcfData);
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

    const invoiceType = sanitizeString(req.body.invoiceType, 30) || "consumer_final";
    const validInvoiceTypes = INVOICE_TYPES;

    if (!validInvoiceTypes.includes(invoiceType)) {
      throw new Error("Tipo de factura inválido");
    }

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
      taxConfig: getInvoiceTaxConfig(tenant, invoiceType),
    });

    const subtotal = roundMoney(normalizedItems.reduce((acc, i) => acc + Number(i.subtotal || 0), 0));
    const tax = roundMoney(normalizedItems.reduce((acc, i) => acc + Number(i.tax || 0), 0));
    const { currency, exchangeRate } = parseInvoiceCurrency(req.body);
    const applyRetentions = req.body.applyRetentions === true;
    const itbisRetention = applyRetentions ? roundMoney(tax) : 0;
    const isrRetention = applyRetentions ? roundMoney(subtotal * 0.15) : 0;
    const totalRetentions = roundMoney(itbisRetention + isrRetention);

    const total = roundMoney(subtotal + tax - totalRetentions);
    const paid = isDraft ? 0 : sanitizeNumber(amountPaid);

    if (paid < 0) throw new Error("El monto pagado no puede ser negativo");
    if (paid > total) throw new Error("El monto pagado no puede ser mayor al total");

    let finalStatus = status;

    if (!isDraft) {
      if (paid >= total && total > 0) finalStatus = "paid";
      else if (paid > 0) finalStatus = "partial";
      else finalStatus = "issued";
    }

    const customerId = await resolveCustomerId({
      tenantId,
      customerId: req.body.customerId,
      customerRnc,
      transaction,
    });

    const invoice = await Invoice.create(
      {
        tenantId,
        invoiceNumber: generateInvoiceNumber(tenant),
        invoiceType,
        customerId,
        customerName: customerName.trim(),
        customerRnc,
        customerPhone,
        customerEmail,
        subtotal,
        tax,
        currency,
        exchangeRate,
        applyRetentions,
        itbisRetention,
        isrRetention,
        totalRetentions,
        total,
        amountPaid: paid,
        balance: roundMoney(total - paid),
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
    const invoiceType = sanitizeString(req.body.invoiceType, 30) || "consumer_final";

    const validInvoiceTypes = INVOICE_TYPES;

    if (!validInvoiceTypes.includes(invoiceType)) {
      throw new Error("Tipo de factura inválido");
    }
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
      taxConfig: getInvoiceTaxConfig(tenant, invoiceType),
    });

    const subtotal = roundMoney(normalizedItems.reduce((acc, item) => acc + Number(item.subtotal || 0), 0));
    const tax = roundMoney(normalizedItems.reduce((acc, item) => acc + Number(item.tax || 0), 0));
    const { currency, exchangeRate } = parseInvoiceCurrency(req.body);
    const applyRetentions = req.body.applyRetentions === true;

    const itbisRetention = applyRetentions ? roundMoney(tax) : 0;
    const isrRetention = applyRetentions ? roundMoney(subtotal * 0.15) : 0;
    const totalRetentions = roundMoney(itbisRetention + isrRetention);

    const total = roundMoney(subtotal + tax - totalRetentions);

    const customerId = await resolveCustomerId({
      tenantId,
      customerId: req.body.customerId,
      customerRnc,
      transaction,
    });

    await invoice.update(
      {
        customerId,
        customerName: customerName.trim(),
        customerRnc,
        customerPhone,
        customerEmail,
        invoiceType,
        subtotal,
        tax,
        currency,
        exchangeRate,
        applyRetentions,
        itbisRetention,
        isrRetention,
        totalRetentions,
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
      productName: item.productName,
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

// Devuelve al inventario lo que salió con la factura
export const returnInvoiceStock = async ({
  invoice,
  tenantId,
  userId,
  reason,
  transaction,
}) => {
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
        reason,
        referenceType: "invoice",
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
      },
      { transaction }
    );
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

    const fiscalUsage = await getActiveFiscalUsage(
      tenantId,
      "invoice",
      invoice.id,
      transaction
    );

    if (fiscalUsage) {
      if (["SENT", "ACCEPTED"].includes(fiscalUsage.status)) {
        throw new Error(
          `Esta factura ya se envió a la DGII con el e-NCF ${fiscalUsage.eNcf}. No se puede anular aquí: se corrige con una nota de crédito.`
        );
      }

      if (fiscalUsage.status === "RESERVED" && fiscalUsage.attempts > 0) {
        throw new Error(
          `No se ha confirmado si el e-NCF ${fiscalUsage.eNcf} llegó a la DGII. Reintenta la emisión para verificarlo antes de anular la factura.`
        );
      }

      // El número nunca llegó a MSeller: queda pendiente de anular ante la DGII
      if (["RESERVED", "FAILED"].includes(fiscalUsage.status)) {
        await voidFiscalNumber(
          fiscalUsage,
          "Factura anulada antes de enviarse a la DGII",
          transaction
        );
      }
    }

    await returnInvoiceStock({
      invoice,
      tenantId,
      userId,
      reason: "Anulación de factura",
      transaction,
    });

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