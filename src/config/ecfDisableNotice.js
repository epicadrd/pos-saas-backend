// Aviso que el usuario acepta al apagar el e-CF. Es la única copia del texto:
// el frontend lo pide por API y el historial guarda exactamente esta versión.
// Cualquier cambio de redacción debe subir `version`.
export const ECF_DISABLE_NOTICE = {
  version: "2026-11-18",
  title: "¿Desactivar la facturación electrónica?",
  message:
    "Mientras esté desactivada, las facturas que emitas no se enviarán a la DGII como comprobantes fiscales electrónicos (e-CF). " +
    "Si tu empresa está autorizada como emisor electrónico, la DGII exige que tus ventas tengan su e-CF. " +
    "Desactivarla es decisión y responsabilidad exclusiva de tu empresa. " +
    "EPICA SRL queda exonerada de toda responsabilidad por las facturas emitidas sin e-CF y por cualquier sanción, multa o reclamo de la DGII que se derive de ello. " +
    "Al aceptar, quedará constancia de tu aceptación con tu usuario, la fecha y la hora.",
  confirmText: "Acepto, desactivar",
  cancelText: "Mantener activada",
};
