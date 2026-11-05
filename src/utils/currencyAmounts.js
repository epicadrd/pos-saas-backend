import { fn, literal } from "sequelize";

/*
 * Las facturas en US$ guardan sus montos en dólares junto con la tasa de
 * cambio de la factura. Los recibos no tienen moneda propia: se pagan contra
 * el balance de su factura, así que están en la moneda de esa factura.
 *
 * Todo lo que suma montos (dashboard, reportes, contabilidad, cuentas por
 * cobrar) los lleva a pesos con la tasa de la factura usando estas expresiones.
 */

const quote = (name) => `\`${name}\``;

// Tasa a pesos de una factura; `alias` es el nombre de la tabla en la consulta
export const invoiceRateSql = (alias = "Invoice") =>
  `(CASE WHEN ${quote(alias)}.${quote("currency")} = 'USD' AND ${quote(alias)}.${quote("exchangeRate")} > 0 ` +
  `THEN ${quote(alias)}.${quote("exchangeRate")} ELSE 1 END)`;

export const invoiceDopSql = (column, alias = "Invoice") =>
  `(${quote(alias)}.${quote(column)} * ${invoiceRateSql(alias)})`;

// Tasa a pesos de un recibo: la de su factura, o 1 si no tiene factura
export const receiptRateSql = (alias = "Receipt") =>
  `COALESCE((SELECT CASE WHEN ri.currency = 'USD' AND ri.exchangeRate > 0 THEN ri.exchangeRate ELSE 1 END ` +
  `FROM Invoices AS ri WHERE ri.id = ${quote(alias)}.${quote("invoiceId")}), 1)`;

export const receiptDopSql = (alias = "Receipt") =>
  `(${quote(alias)}.${quote("amount")} * ${receiptRateSql(alias)})`;

// Moneda de un recibo, para mostrar su monto con el símbolo correcto
export const receiptCurrencySql = (alias = "Receipt") =>
  `COALESCE((SELECT ri.currency FROM Invoices AS ri WHERE ri.id = ${quote(alias)}.${quote("invoiceId")}), 'DOP')`;

export const roundMoney = (value) =>
  Math.round((Number(value) || 0) * 100) / 100;

const sumWith = async (Model, expression, where) => {
  const row = await Model.findOne({
    attributes: [[fn("SUM", literal(expression)), "total"]],
    where,
    raw: true,
  });

  return roundMoney(row?.total);
};

// Equivalente a Invoice.sum(column, { where }) pero en pesos
export const sumInvoicesInDop = (Invoice, column, { where }) =>
  sumWith(Invoice, invoiceDopSql(column), where);

// Equivalente a Receipt.sum("amount", { where }) pero en pesos
export const sumReceiptsInDop = (Receipt, { where }) =>
  sumWith(Receipt, receiptDopSql(), where);

// SUM de una columna de las líneas de factura, en pesos (requiere incluir Invoice)
export const sumInvoiceItemDopAttr = (column, itemAlias = "InvoiceItem", invoiceAlias = "Invoice") =>
  fn("SUM", literal(`(${quote(itemAlias)}.${quote(column)} * ${invoiceRateSql(invoiceAlias)})`));

// Atributo SUM(...) en pesos para consultas agrupadas
export const sumInvoiceDopAttr = (column, alias = "Invoice") =>
  fn("SUM", literal(invoiceDopSql(column, alias)));

export const sumReceiptDopAttr = (alias = "Receipt") =>
  fn("SUM", literal(receiptDopSql(alias)));
