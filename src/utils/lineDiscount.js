/*
 * Cotizaciones y conduces guardan el descuento de cada línea como
 * PORCENTAJE (0-100); las facturas lo guardan como MONTO en pesos.
 *
 * Al pasar una línea a factura, el monto sale de lo que ya se calculó en el
 * documento original (bruto - subtotal), así cuadra al centavo con su
 * subtotal y con la validación del e-CF (cantidad x precio - descuento).
 */
export const percentLineDiscountToAmount = ({ quantity, unitPrice, subtotal, discount }) => {
  if (!(Number(discount) > 0)) return 0;

  const grossCents = Math.round(Number(quantity || 0) * Number(unitPrice || 0) * 100);
  const subtotalCents = Math.round(Number(subtotal || 0) * 100);

  return Math.max(grossCents - subtotalCents, 0) / 100;
};
