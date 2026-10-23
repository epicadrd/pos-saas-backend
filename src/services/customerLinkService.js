import { Op, fn, col, where as sqlWhere } from "sequelize";
import { Customer } from "../models/index.js";
import { sanitizeInteger } from "../utils/sanitize.js";

/*
 * El RNC se guarda como se escribió; al comparar solo cuentan
 * los dígitos: "131-12345-6", "131 12345 6" y "131123456" son el mismo.
 */
export const normalizeRnc = (value) => String(value || "").replace(/\D/g, "");

const digitsOnlyColumn = (column) =>
  fn(
    "REPLACE",
    fn("REPLACE", fn("REPLACE", col(column), "-", ""), " ", ""),
    ".",
    ""
  );

// Condición: la columna tiene el mismo número de RNC (ignora el formato)
export const rncMatches = (column, rnc) =>
  sqlWhere(digitsOnlyColumn(column), normalizeRnc(rnc));

/*
 * Devuelve el customerId a guardar en un documento.
 * - Si viene un id, solo se acepta si el cliente es de la empresa.
 * - Si no, se intenta por número de RNC entre los clientes activos.
 * - Si no hay coincidencia, el documento queda sin vincular (null).
 */
export const resolveCustomerId = async ({
  tenantId,
  customerId,
  customerRnc,
  transaction,
}) => {
  const id = sanitizeInteger(customerId, 0);

  if (id > 0) {
    const customer = await Customer.findOne({
      where: { id, tenantId },
      attributes: ["id"],
      transaction,
    });

    if (customer) return customer.id;
  }

  if (normalizeRnc(customerRnc)) {
    const customer = await Customer.findOne({
      where: {
        tenantId,
        isActive: true,
        [Op.and]: [rncMatches("rnc", customerRnc)],
      },
      attributes: ["id"],
      transaction,
    });

    if (customer) return customer.id;
  }

  return null;
};

/*
 * Condición para documentos anteriores a customerId (NULL):
 * se asocian por RNC; si el documento no tiene RNC, por nombre.
 * Si el cliente no tiene RNC, solo por nombre.
 */
export const buildLegacyCustomerMatch = (customer, { hasRnc = true } = {}) => {
  if (hasRnc && normalizeRnc(customer.rnc)) {
    return {
      [Op.or]: [
        rncMatches("customerRnc", customer.rnc),
        { customerRnc: null, customerName: customer.name },
        { customerRnc: "", customerName: customer.name },
      ],
    };
  }

  return { customerName: customer.name };
};

/*
 * Documentos que pertenecen al cliente: vinculados por id, o
 * antiguos (customerId NULL) que coinciden por RNC / nombre.
 */
export const buildCustomerDocumentWhere = (customer, options) => ({
  [Op.or]: [
    { customerId: customer.id },
    {
      [Op.and]: [
        { customerId: null },
        buildLegacyCustomerMatch(customer, options),
      ],
    },
  ],
});
