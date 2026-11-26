/*
 * Base del ITBIS de un documento (cotización o factura).
 * 100: ITBIS sobre todo el monto (18% normal).
 * 10: ITBIS sobre el 10% del monto, como facturan los subcontratistas de
 *     obra con materiales (Norma General 07-2007, art. 4): 18% x 10% = 1.8%.
 */
export const TAX_BASE_FULL = 100;
export const TAX_BASE_CONSTRUCTION = 10;

export const parseTaxBasePercent = (value) =>
  Number(value) === TAX_BASE_CONSTRUCTION ? TAX_BASE_CONSTRUCTION : TAX_BASE_FULL;

// Fracción del subtotal que paga ITBIS: 1 o 0.1
export const taxBaseFactor = (taxBasePercent) =>
  parseTaxBasePercent(taxBasePercent) / 100;
