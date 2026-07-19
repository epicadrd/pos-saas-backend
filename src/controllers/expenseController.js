import { Op, fn, col } from "sequelize";
import { Expense, Supplier } from "../models/index.js";
import { logActivity } from "../utils/activityLogger.js";
import {
  sanitizeString,
  sanitizeNumber,
  sanitizeInteger,
} from "../utils/sanitize.js";
import ExcelJS from "exceljs";

const money = (value) => Number(value || 0);
const SPANISH_MONTHS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

const EXPENSE_EXPORT_HEADERS = [
  "RNC",
  "CONCEPTO",
  "NCF",
  "MONTO FACTURADO",
  "ITBIS",
  "Monto Retención Renta",
  "ITBIS RETENIDO",
  "MONTO PROPINA LEGAL",
  "ISC",
  "OTROS IMPUESTOS",
  "FECHA",
  "METODO DE PAGO",
];

const PAYMENT_METHOD_EXPORT_LABELS = {
  cash: "EFECTIVO",
  card: "TARJETA",
  transfer: "TRANSFERENCIA",
  check: "CHEQUE",
  credit: "CRÉDITO",
  other: "OTRO",
};

const decodeHtml = (text = "") =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#225;/g, "á")
    .replace(/&#233;/g, "é")
    .replace(/&#237;/g, "í")
    .replace(/&#243;/g, "ó")
    .replace(/&#250;/g, "ú")
    .replace(/\s+/g, " ")
    .trim();

const normalizeText = (text = "") =>
  decodeHtml(String(text))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s:]+/g, " ")
    .trim()
    .toLowerCase();

const stripTags = (html = "") =>
  decodeHtml(String(html).replace(/<[^>]+>/g, " "));

const getUrlParam = (params, names = []) => {
  const allowedNames = names.map((name) => name.toLowerCase());

  for (const [key, value] of params.entries()) {
    if (allowedNames.includes(key.toLowerCase())) {
      return value?.trim() || "";
    }
  }

  return "";
};

const extractDgiiValue = (html, label) => {
  const normalizedLabel = normalizeText(label);

  const rows = String(html).match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    const cells = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];

    if (cells.length < 2) continue;

    const key = normalizeText(stripTags(cells[0]));
    const value = stripTags(cells[1]).replace(/\s+/g, " ").trim();

    if (key === normalizedLabel || key.includes(normalizedLabel)) {
      return value;
    }
  }

  return "";
};
const normalizeDgiiDate = (date = "") => {
  const [day, month, year] = date.split("-");

  if (!day || !month || !year) return "";

  return `${year}-${month}-${day}`;
};

const parseAmount = (value = "") =>
  Number(String(value).replace(/,/g, "").trim() || 0);

const buildExpenseNumber = async (tenantId) => {
  const count = await Expense.count({ where: { tenantId } });

  return `GAS-${String(count + 1).padStart(6, "0")}`;
};

const validateSupplierTenant = async (supplierId, tenantId) => {
  if (!supplierId) return null;

  const supplier = await Supplier.findOne({
    where: {
      id: supplierId,
      tenantId,
    },
  });

  if (!supplier) {
    const error = new Error(
      "El proveedor seleccionado no existe o no pertenece a esta empresa"
    );
    error.status = 400;
    throw error;
  }

  return supplier;
};

const normalizeAmounts = ({ subtotal, tax, total }) => {
  const cleanSubtotal = money(subtotal);
  const cleanTax = money(tax);

  const cleanTotal =
    total !== undefined && total !== null && total !== ""
      ? money(total)
      : cleanSubtotal + cleanTax;

  return {
    subtotal: cleanSubtotal,
    tax: cleanTax,
    total: cleanTotal,
  };
};

const validateUniqueNcf = async ({ tenantId, ncf, excludeId = null }) => {
  const cleanNcf = sanitizeString(ncf, 30)?.trim()?.toUpperCase();

  if (!cleanNcf) return;

  const where = {
    tenantId,
    ncf: cleanNcf,
  };

  if (excludeId) {
    where.id = { [Op.ne]: excludeId };
  }

  const existingExpense = await Expense.findOne({ where });

  if (existingExpense) {
    const error = new Error(
      `Este e-NCF ya existe en el gasto ${existingExpense.expenseNumber}.`
    );

    error.status = 409;
    error.details = {
      expenseId: existingExpense.id,
      expenseNumber: existingExpense.expenseNumber,
      ncf: cleanNcf,
    };

    throw error;
  }
};

export const getExpenses = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const search = sanitizeString(req.query.search || "", 120);
    const category = sanitizeString(req.query.category || "", 80);
    const status = sanitizeString(req.query.status || "", 30);
    const supplierId = sanitizeInteger(req.query.supplierId, 0);
    const from = sanitizeString(req.query.from || "", 20);
    const to = sanitizeString(req.query.to || "", 20);
    const where = { tenantId };

    if (category) where.category = category;
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    if (from || to) {
      where.expenseDate = {};
      if (from) where.expenseDate[Op.gte] = from;
      if (to) where.expenseDate[Op.lte] = to;
    }

    if (search) {
      where[Op.or] = [
        { ncf: { [Op.like]: `%${search}%` } },
        { expenseNumber: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { supplierName: { [Op.like]: `%${search}%` } },
        { category: { [Op.like]: `%${search}%` } },
      ];
    }

    const expenses = await Expense.findAll({
      where,
      include: [
        {
          model: Supplier,
          as: "supplier",
          where: { tenantId },
          required: false,
          attributes: ["id", "name", "rnc", "phone", "email"],
        },
      ],
      order: [
        ["expenseDate", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    res.json(expenses);
  } catch (error) {
    console.log("GET EXPENSES ERROR:", error);

    res.status(500).json({
      message: "Error obteniendo gastos",
    });
  }
};

export const exportMonthlyExpenses = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const currentDate = new Date();

    const defaultMonth = `${currentDate.getFullYear()}-${String(
      currentDate.getMonth() + 1
    ).padStart(2, "0")}`;

    const monthValue = sanitizeString(
      req.query.month || defaultMonth,
      7
    );

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue)) {
      return res.status(400).json({
        message: "El mes indicado no es válido",
      });
    }

    const [yearText, monthText] = monthValue.split("-");
    const year = Number(yearText);
    const month = Number(monthText);

    const lastDay = new Date(year, month, 0).getDate();

    const from = `${yearText}-${monthText}-01`;

    const to = `${yearText}-${monthText}-${String(
      lastDay
    ).padStart(2, "0")}`;

    const expenses = await Expense.findAll({
      where: {
        tenantId,

        expenseDate: {
          [Op.between]: [from, to],
        },

        status: {
          [Op.ne]: "cancelled",
        },
      },

      include: [
        {
          model: Supplier,
          as: "supplier",
          where: { tenantId },
          required: false,
          attributes: ["id", "name", "rnc"],
        },
      ],

      order: [
        ["expenseDate", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Aventra";
    workbook.company = "ÉPICA SRL";
    workbook.created = new Date();

    const monthName = SPANISH_MONTHS[month - 1];
    const sheetName = `606 ${monthName} ${year}`;

    const worksheet = workbook.addWorksheet(
      sheetName,
      {
        views: [
          {
            state: "frozen",
            ySplit: 1,
          },
        ],

        pageSetup: {
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        },
      }
    );

    worksheet.columns = [
      { key: "rnc", width: 18 },
      { key: "concept", width: 32 },
      { key: "ncf", width: 24 },
      { key: "total", width: 18 },
      { key: "tax", width: 14 },
      { key: "incomeTaxWithholding", width: 20 },
      { key: "itbisWithheld", width: 18 },
      { key: "legalTip", width: 20 },
      { key: "isc", width: 12 },
      { key: "otherTaxes", width: 18 },
      { key: "day", width: 12 },
      { key: "paymentMethod", width: 20 },
    ];

    const headerRow = worksheet.addRow(
      EXPENSE_EXPORT_HEADERS
    );

    headerRow.height = 32;

    headerRow.eachCell((cell) => {
      cell.font = {
        name: "Roboto",
        size: 10,
        bold: true,
        color: {
          argb: "FFFFFFFF",
        },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: "FF356854",
        },
      };

      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };

      cell.border = {
        top: {
          style: "thin",
          color: { argb: "FF356854" },
        },
        bottom: {
          style: "thin",
          color: { argb: "FF356854" },
        },
        left: {
          style: "thin",
          color: { argb: "FF356854" },
        },
        right: {
          style: "thin",
          color: { argb: "FF356854" },
        },
      };
    });

    expenses.forEach((expense, index) => {
      const expenseDate = String(
        expense.expenseDate || ""
      );

      const day =
        Number(expenseDate.slice(8, 10)) || null;

      const supplierRnc =
        expense.supplier?.rnc ||
        expense.supplierRnc ||
        "";

      const concept =
        expense.description ||
        expense.category ||
        "";

      const row = worksheet.addRow([
        String(supplierRnc),
        concept,
        expense.ncf || "",
        money(expense.total),
        money(expense.tax),

        // Aventra todavía no almacena estos campos.
        null, // Retención de renta
        null, // ITBIS retenido
        null, // Propina legal
        null, // ISC
        null, // Otros impuestos

        day,

        PAYMENT_METHOD_EXPORT_LABELS[
          expense.paymentMethod
        ] || "OTRO",
      ]);

      const backgroundColor =
        index % 2 === 0
          ? "FFFFFFFF"
          : "FFF6F8F9";

      row.height = 22;

      row.eachCell(
        { includeEmpty: true },
        (cell, columnNumber) => {
          cell.font = {
            name: "Roboto",
            size: 10,
            color: {
              argb: "FF434343",
            },
          };

          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb: backgroundColor,
            },
          };

          cell.alignment = {
            vertical: "middle",

            horizontal: [
              4, 5, 6, 7, 8, 9, 10, 11,
            ].includes(columnNumber)
              ? "center"
              : "left",
          };

          cell.border = {
            top: {
              style: "thin",
              color: {
                argb: backgroundColor,
              },
            },

            bottom: {
              style: "thin",
              color: {
                argb: backgroundColor,
              },
            },

            left: {
              style: "thin",
              color: {
                argb:
                  columnNumber === 1
                    ? "FF356854"
                    : backgroundColor,
              },
            },

            right: {
              style: "thin",
              color: {
                argb:
                  columnNumber === 12
                    ? "FF356854"
                    : backgroundColor,
              },
            },
          };
        }
      );

      // RNC y NCF como texto para no perder ceros.
      row.getCell(1).numFmt = "@";
      row.getCell(3).numFmt = "@";

      // Valores monetarios reales.
      row.getCell(4).numFmt = "#,##0.00";
      row.getCell(5).numFmt = "#,##0.00";

      // La plantilla utiliza únicamente el día del mes.
      row.getCell(11).numFmt = "0";
    });

    const lastRowNumber = Math.max(
      worksheet.rowCount,
      1
    );

    worksheet.autoFilter = {
      from: {
        row: 1,
        column: 1,
      },

      to: {
        row: lastRowNumber,
        column: 12,
      },
    };

    const buffer =
      await workbook.xlsx.writeBuffer();

    const fileName =
      `606 GASTOS ${monthName} ${year}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.log(
      "EXPORT EXPENSES ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "No se pudo exportar el archivo de gastos",
    });
  }
};

export const importExpenseFromDgii = async (req, res) => {
  try {
    const rawUrl = sanitizeString(req.body.url, 500);

    if (!rawUrl) {
      return res.status(400).json({
        message: "El enlace de verificación es obligatorio",
      });
    }

    const parsedUrl = new URL(rawUrl);

    if (parsedUrl.hostname !== "ecf.dgii.gov.do") {
      return res.status(400).json({
        message: "Solo se permiten enlaces de verificación de la DGII",
      });
    }

    const params = parsedUrl.searchParams;

   const urlSupplierRnc = getUrlParam(params, [
      "RncEmisor",
      "RNCEmisor",
      "rncEmisor",
      "rnc_emisor",
      "rncemisor",
    ]);

    const urlNcf = getUrlParam(params, [
      "ENCF",
      "Encf",
      "eNCF",
      "encf",
      "NCF",
      "ncf",
    ]);

    const urlDate = getUrlParam(params, [
      "FechaEmision",
      "fechaEmision",
      "fechaemision",
      "Fecha",
      "fecha",
    ]);

    const urlTotal = getUrlParam(params, [
      "MontoTotal",
      "montoTotal",
      "montototal",
      "Total",
      "total",
    ]);

   let html = "";

try {
  const dgiiRes = await fetch(rawUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 Corex/1.0",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (dgiiRes.ok) {
    html = await dgiiRes.text();
  }
} catch (fetchError) {
  console.log("DGII FETCH WARNING:", fetchError.message);
}
 
const status = extractDgiiValue(html, "Estado");

if (status && normalizeText(status) !== "aceptado") {
  return res.status(400).json({
    message: `La factura aparece con estado: ${status}`,
  });
}

const supplierRnc =
  extractDgiiValue(html, "RNC Emisor") || urlSupplierRnc;

const supplierName =
  extractDgiiValue(html, "Razón social emisor") ||
  extractDgiiValue(html, "Razon social emisor") ||
  "";

const ncf =
  urlNcf ||
  extractDgiiValue(html, "e-NCF") ||
  extractDgiiValue(html, "ENCF");

const expenseDate =
  normalizeDgiiDate(extractDgiiValue(html, "Fecha de Emisión")) ||
  normalizeDgiiDate(extractDgiiValue(html, "Fecha de Emision")) ||
  normalizeDgiiDate(urlDate);

const tax = parseAmount(
  extractDgiiValue(html, "Total de ITBIS") ||
    extractDgiiValue(html, "ITBIS")
);

const total =
  parseAmount(extractDgiiValue(html, "Monto Total")) ||
  parseAmount(urlTotal);

const subtotal = Math.max(total - tax, 0);
  
if (process.env.NODE_ENV !== "production") {
    console.log("DGII IMPORT DATA:", {
      supplierRnc,
      supplierName,
      ncf,
      expenseDate,
      tax,
      total,
      subtotal,
    });
  }

   if (!ncf || !expenseDate || !total) {
    return res.status(400).json({
      message: "No se pudieron leer los datos principales de la factura",
    });
  }

    res.json({
      supplierName,
      supplierRnc,
      ncf,
      expenseDate,
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      subtotal: subtotal.toFixed(2),
      category: "Operativo",
      description: "",
      notes: "",
    });
  } catch (error) {
    console.log("IMPORT DGII EXPENSE ERROR:", error);

    res.status(500).json({
      message: "Error importando datos desde DGII",
    });
  }
};

export const createExpense = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const category = sanitizeString(req.body.category, 80);
    const description = sanitizeString(req.body.description, 1000);
    const supplierId = sanitizeInteger(req.body.supplierId, 0);
    const supplierName = sanitizeString(req.body.supplierName, 120);
    const supplierRnc = sanitizeString(req.body.supplierRnc, 30);
    const ncf = sanitizeString(req.body.ncf, 30)?.toUpperCase() || null;
    const expenseDate = sanitizeString(req.body.expenseDate, 20);
    const paymentMethod = sanitizeString(req.body.paymentMethod, 30) || "cash";
    const status = sanitizeString(req.body.status, 30) || "paid";
    const notes = sanitizeString(req.body.notes, 2000);

    if (!category) {
      return res.status(400).json({
        message: "La categoría es obligatoria",
      });
    }

    if (!description) {
      return res.status(400).json({
        message: "La descripción es obligatoria",
      });
    }

    if (!expenseDate) {
      return res.status(400).json({
        message: "La fecha es obligatoria",
      });
    }

    const amounts = normalizeAmounts(req.body);

    if (amounts.total <= 0) {
      return res.status(400).json({
        message: "El total debe ser mayor que cero",
      });
    }

    await validateUniqueNcf({
      tenantId,
      ncf,
    });

    await validateSupplierTenant(supplierId, tenantId);

    const expense = await Expense.create({
      tenantId,
      expenseNumber: await buildExpenseNumber(tenantId),
      category: category.trim(),
      description: description.trim(),
      supplierId: supplierId || null,
      supplierName,
      supplierRnc,
      ncf: ncf?.trim()?.toUpperCase() || null,
      expenseDate,
      paymentMethod: paymentMethod || "cash",
      status: status || "paid",
      notes,
      ...amounts,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    await logActivity({
      tenantId,
      userId: req.user.id,
      module: "gastos",
      action: "create",
      description: `Registró el gasto ${expense.expenseNumber} por RD$${expense.total}`,
      metadata: {
        expenseId: expense.id,
      },
    });

    res.status(201).json(expense);
  } catch (error) {
    console.log("CREATE EXPENSE ERROR:", error);

    res.status(error.status || 500).json({
      message: error.message || "Error creando gasto",
      details: error.details || null,
    });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const payload = {
      category: sanitizeString(req.body.category, 80),
      description: sanitizeString(req.body.description, 1000),
      supplierId:
        req.body.supplierId !== undefined &&
        req.body.supplierId !== null &&
        req.body.supplierId !== ""
          ? sanitizeInteger(req.body.supplierId, 0)
          : null,
      supplierName: sanitizeString(req.body.supplierName, 120),
      supplierRnc: sanitizeString(req.body.supplierRnc, 30),
      ncf: sanitizeString(req.body.ncf, 30)?.toUpperCase() || null,
      expenseDate: sanitizeString(req.body.expenseDate, 20),
      paymentMethod: sanitizeString(req.body.paymentMethod, 30) || "cash",
      status: sanitizeString(req.body.status, 30) || "paid",
      notes: sanitizeString(req.body.notes, 2000),
      subtotal: sanitizeNumber(req.body.subtotal),
      tax: sanitizeNumber(req.body.tax),
      total: sanitizeNumber(req.body.total),
      updatedBy: req.user.id,
    };

    const expense = await Expense.findOne({
      where: {
        id: req.params.id,
        tenantId,
      },
    });

    if (!expense) {
      return res.status(404).json({
        message: "Gasto no encontrado",
      });
    }

    await validateUniqueNcf({
      tenantId,
      ncf: payload.ncf,
      excludeId: expense.id,
    });

    if (
      req.body.subtotal !== undefined ||
      req.body.tax !== undefined ||
      req.body.total !== undefined
    ) {
      Object.assign(
        payload,
        normalizeAmounts({
          subtotal: req.body.subtotal ?? expense.subtotal,
          tax: req.body.tax ?? expense.tax,
          total: req.body.total ?? expense.total,
        })
      );
    }

    if (req.body.supplierId !== undefined) {
      await validateSupplierTenant(payload.supplierId, tenantId);
    }

    await expense.update(payload);

    await logActivity({
      tenantId,
      userId: req.user.id,
      module: "gastos",
      action: "update",
      description: `Actualizó el gasto ${expense.expenseNumber}`,
      metadata: {
        expenseId: expense.id,
      },
    });

    res.json(expense);
  } catch (error) {
    console.log("UPDATE EXPENSE ERROR:", error);

   res.status(error.status || 500).json({
      message: error.message || "Error actualizando gasto",
      details: error.details || null,
   });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const expense = await Expense.findOne({
      where: {
        id: req.params.id,
        tenantId,
      },
    });

    if (!expense) {
      return res.status(404).json({
        message: "Gasto no encontrado",
      });
    }

    await expense.destroy();

    await logActivity({
      tenantId,
      userId: req.user.id,
      module: "gastos",
      action: "delete",
      description: `Eliminó el gasto ${expense.expenseNumber}`,
      metadata: {
        expenseId: expense.id,
      },
    });

    res.json({
      message: "Gasto eliminado",
    });
  } catch (error) {
    console.log("DELETE EXPENSE ERROR:", error);

    res.status(500).json({
      message: "Error eliminando gasto",
    });
  }
};

export const getExpenseStats = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const from = sanitizeString(req.query.from || "", 20);
    const to = sanitizeString(req.query.to || "", 20);

    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const dateWhere = {};

    if (from || to) {
      if (from) dateWhere[Op.gte] = from;
      if (to) dateWhere[Op.lte] = to;
    } else {
      dateWhere[Op.gte] = start;
    }

    const baseWhere = {
      tenantId,
      expenseDate: dateWhere,
    };

    const [monthTotal, monthTaxTotal, pendingTotal, byCategory] =
      await Promise.all([
        Expense.sum("total", {
          where: {
            ...baseWhere,
            status: "paid",
          },
        }),

        Expense.sum("tax", {
          where: {
            ...baseWhere,
            status: "paid",
          },
        }),

        Expense.sum("total", {
          where: {
            ...baseWhere,
            status: "pending",
          },
        }),

        Expense.findAll({
          where: {
            ...baseWhere,
            status: {
              [Op.ne]: "cancelled",
            },
          },
          attributes: [
            "category",
            [fn("SUM", col("total")), "total"],
            [fn("SUM", col("tax")), "tax"],
          ],
          group: ["category"],
          raw: true,
        }),
      ]);

    res.json({
      monthTotal: Math.max(money(monthTotal) - money(monthTaxTotal), 0),
      monthGrossTotal: money(monthTotal),
      monthTaxTotal: money(monthTaxTotal),
      pendingTotal: money(pendingTotal),
      byCategory: byCategory.map((item) => ({
        ...item,
        total: Math.max(money(item.total) - money(item.tax), 0),
        grossTotal: money(item.total),
        tax: money(item.tax),
      })),
    });
  } catch (error) {
    console.log("EXPENSE STATS ERROR:", error);

    res.status(500).json({
      message: "Error cargando estadísticas de gastos",
    });
  }
};