import { Op } from "sequelize";
import { Customer, Invoice, Quote, Receipt } from "../models/index.js";
import {
  buildCustomerDocumentWhere,
  normalizeRnc,
  rncMatches,
} from "../services/customerLinkService.js";
import {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
} from "../utils/sanitize.js";

export const getCustomers = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const search = sanitizeString(req.query.search || "", 120);
    const status = sanitizeString(req.query.status || "active", 20);

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

    const name = sanitizeString(req.body.name, 120);
    const rnc = sanitizeString(req.body.rnc, 30);
    const phone = sanitizePhone(req.body.phone);
    const email = sanitizeEmail(req.body.email);
    const address = sanitizeString(req.body.address, 255);

    if (!name) {
      return res.status(400).json({ message: "El nombre del cliente es obligatorio" });
    }

    if (normalizeRnc(rnc)) {
      const exists = await Customer.findOne({
        where: {
          tenantId,
          isActive: true,
          [Op.and]: [rncMatches("rnc", rnc)],
        },
      });

      if (exists) {
        return res.status(400).json({ message: "Ya existe un cliente con este RNC/Cédula" });
      }
    }

    const customer = await Customer.create({
      tenantId,
      name,
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

    const name = sanitizeString(req.body.name, 120);
    const rnc = sanitizeString(req.body.rnc, 30);
    const phone = sanitizePhone(req.body.phone);
    const email = sanitizeEmail(req.body.email);
    const address = sanitizeString(req.body.address, 255);

    const customer = await Customer.findOne({
      where: { id, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    if (!name) {
      return res.status(400).json({ message: "El nombre del cliente es obligatorio" });
    }

    if (normalizeRnc(rnc)) {
      const exists = await Customer.findOne({
        where: {
          tenantId,
          isActive: true,
          id: { [Op.ne]: id },
          [Op.and]: [rncMatches("rnc", rnc)],
        },
      });

      if (exists) {
        return res.status(400).json({ message: "Ya existe otro cliente con este RNC/Cédula" });
      }
    }

    await customer.update({
      name,
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

const PROFILE_LIMIT = 500;

const todayDateOnly = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

// Misma regla que quoteController: una cotización abierta con
// fecha de validez pasada se considera vencida.
const getQuoteEffectiveStatus = (quote, today) => {
  const validUntil = quote.validUntil ? String(quote.validUntil).slice(0, 10) : null;

  if (
    validUntil &&
    validUntil < today &&
    !["converted", "approved", "rejected"].includes(quote.status)
  ) {
    return "expired";
  }

  return quote.status;
};

const toNumber = (value) => Number(value) || 0;

export const getCustomerProfile = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const customer = await Customer.findOne({
      where: { id, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    const today = todayDateOnly();

    const [invoices, quotes] = await Promise.all([
      Invoice.findAll({
        where: {
          tenantId,
          status: { [Op.ne]: "draft" },
          ...buildCustomerDocumentWhere(customer),
        },
        attributes: [
          "id",
          "invoiceNumber",
          "eNcf",
          "invoiceType",
          "invoiceDate",
          "dueDate",
          "total",
          "amountPaid",
          "balance",
          "status",
          "createdAt",
        ],
        order: [["createdAt", "DESC"]],
        limit: PROFILE_LIMIT,
      }),
      Quote.findAll({
        where: {
          tenantId,
          status: { [Op.ne]: "draft" },
          ...buildCustomerDocumentWhere(customer),
        },
        attributes: [
          "id",
          "quoteNumber",
          "validUntil",
          "total",
          "status",
          "createdAt",
        ],
        order: [["createdAt", "DESC"]],
        limit: PROFILE_LIMIT,
      }),
    ]);

    const invoiceIds = invoices.map((invoice) => invoice.id);

    // Recibos: vinculados por id, de facturas del cliente, o antiguos
    // sin factura que coinciden por nombre (los recibos no guardan RNC).
    const receiptMatches = [
      { customerId: customer.id },
      { customerId: null, invoiceId: null, customerName: customer.name },
    ];

    if (invoiceIds.length > 0) {
      receiptMatches.push({ invoiceId: { [Op.in]: invoiceIds } });
    }

    const receipts = await Receipt.findAll({
      where: {
        tenantId,
        [Op.or]: receiptMatches,
      },
      attributes: [
        "id",
        "receiptNumber",
        "invoiceId",
        "concept",
        "amount",
        "paymentMethod",
        "reference",
        "receiptDate",
        "status",
        "createdAt",
      ],
      order: [
        ["receiptDate", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: PROFILE_LIMIT,
    });

    const invoiceNumberById = new Map(
      invoices.map((invoice) => [invoice.id, invoice.eNcf || invoice.invoiceNumber])
    );

    const invoiceRows = invoices.map((invoice) => {
      const row = invoice.toJSON();
      const dueDate = row.dueDate ? String(row.dueDate).slice(0, 10) : null;

      return {
        ...row,
        isOverdue:
          ["issued", "partial"].includes(row.status) &&
          toNumber(row.balance) > 0 &&
          Boolean(dueDate) &&
          dueDate < today,
      };
    });

    const quoteRows = quotes.map((quote) => ({
      ...quote.toJSON(),
      status: getQuoteEffectiveStatus(quote, today),
    }));

    const receiptRows = receipts.map((receipt) => ({
      ...receipt.toJSON(),
      invoiceNumber: receipt.invoiceId
        ? invoiceNumberById.get(receipt.invoiceId) || null
        : null,
    }));

    const activeInvoices = invoiceRows.filter((row) => row.status !== "cancelled");
    const paidReceipts = receiptRows.filter((row) => row.status === "paid");

    const summary = {
      invoicesCount: activeInvoices.length,
      totalInvoiced: activeInvoices.reduce((acc, row) => acc + toNumber(row.total), 0),
      pendingBalance: activeInvoices.reduce((acc, row) => acc + toNumber(row.balance), 0),
      overdueCount: invoiceRows.filter((row) => row.isOverdue).length,
      quotesCount: quoteRows.length,
      quotesTotal: quoteRows.reduce((acc, row) => acc + toNumber(row.total), 0),
      quotesWon: quoteRows.filter((row) => ["approved", "converted"].includes(row.status)).length,
      receiptsCount: paidReceipts.length,
      totalReceived: paidReceipts.reduce((acc, row) => acc + toNumber(row.amount), 0),
      lastActivity:
        [invoiceRows[0]?.createdAt, quoteRows[0]?.createdAt, receiptRows[0]?.createdAt]
          .filter(Boolean)
          .sort((a, b) => new Date(b) - new Date(a))[0] || null,
    };

    return res.json({
      customer,
      summary,
      invoices: invoiceRows,
      quotes: quoteRows,
      receipts: receiptRows,
    });
  } catch (error) {
    console.log("GET CUSTOMER PROFILE ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo el perfil del cliente" });
  }
};
