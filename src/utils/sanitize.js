import xss from "xss";
import validator from "validator";

export const sanitizeString = (value, maxLength = 255) => {
  if (value === undefined || value === null) return "";

  let clean = String(value).trim();

  clean = xss(clean);

  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength);
  }

  return clean;
};

export const sanitizeEmail = (email) => {
  if (!email) return "";

  const clean = sanitizeString(email, 255).toLowerCase();

  if (!validator.isEmail(clean)) {
    return "";
  }

  return clean;
};

export const sanitizePhone = (phone) => {
  if (!phone) return "";

  return sanitizeString(phone, 30).replace(/[^0-9+()\-\s]/g, "");
};

export const sanitizeNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

export const sanitizeInteger = (value, fallback = 0) => {
  const number = parseInt(value, 10);

  return Number.isFinite(number) ? number : fallback;
};

export const sanitizeObject = (obj = {}) => {
  const clean = {};

  for (const key in obj) {
    const value = obj[key];

    if (typeof value === "string") {
      clean[key] = sanitizeString(value);
    } else {
      clean[key] = value;
    }
  }

  return clean;
};