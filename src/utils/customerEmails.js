import { sanitizeEmail, sanitizeString } from "./sanitize.js";

export const MAX_CUSTOMER_EMAILS = 5;

export class CustomerEmailError extends Error {}

/*
 * Normaliza los correos de un cliente.
 * - rawEmails: lista enviada por el formulario.
 * - rawPrimary: correo marcado como principal.
 * Devuelve { email, emails } con el principal siempre primero.
 * Si la petición no trae lista, emails = undefined para que la
 * actualización conserve los correos adicionales existentes.
 */
export const normalizeCustomerEmails = (rawEmails, rawPrimary) => {
  const primaryInput = sanitizeString(rawPrimary || "", 255).toLowerCase();

  if (rawEmails === undefined || rawEmails === null) {
    if (primaryInput && !sanitizeEmail(primaryInput)) {
      throw new CustomerEmailError(`El correo "${primaryInput}" no es válido`);
    }

    return { email: primaryInput || null, emails: undefined };
  }

  if (!Array.isArray(rawEmails)) {
    throw new CustomerEmailError("La lista de correos no es válida");
  }

  const emails = [];

  for (const raw of rawEmails) {
    const value = sanitizeString(raw || "", 255).toLowerCase();
    if (!value) continue;

    const clean = sanitizeEmail(value);
    if (!clean) {
      throw new CustomerEmailError(`El correo "${value}" no es válido`);
    }

    if (!emails.includes(clean)) emails.push(clean);
  }

  if (emails.length > MAX_CUSTOMER_EMAILS) {
    throw new CustomerEmailError(
      `Un cliente puede tener hasta ${MAX_CUSTOMER_EMAILS} correos`
    );
  }

  const primary = emails.includes(primaryInput) ? primaryInput : emails[0] || null;
  const ordered = primary
    ? [primary, ...emails.filter((item) => item !== primary)]
    : [];

  return { email: primary, emails: ordered };
};

/*
 * Al actualizar sin lista (p. ej. desde el formulario rápido de Facturas),
 * cambia solo el principal y conserva los demás correos.
 */
export const mergePrimaryEmail = (currentEmails, previousPrimary, newPrimary) => {
  const others = (currentEmails || []).filter(
    (item) => item && item !== previousPrimary && item !== newPrimary
  );

  const merged = (newPrimary ? [newPrimary, ...others] : others).slice(
    0,
    MAX_CUSTOMER_EMAILS
  );

  return { email: newPrimary || merged[0] || null, emails: merged };
};
