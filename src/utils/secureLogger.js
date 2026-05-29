const isProduction = process.env.NODE_ENV === "production";

const SENSITIVE_KEYS = [
  "password",
  "confirmPassword",
  "newPassword",
  "oldPassword",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "jwt",
  "secret",
  "apiKey",
  "signature",
  "stripeSignature",
];

export const redactSensitiveData = (value, depth = 0) => {
  if (depth > 5) return "[MAX_DEPTH]";

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (value && typeof value === "object") {
    const clean = {};

    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();

      const isSensitive = SENSITIVE_KEYS.some((sensitiveKey) =>
        normalizedKey.includes(sensitiveKey.toLowerCase())
      );

      clean[key] = isSensitive ? "[REDACTED]" : redactSensitiveData(item, depth + 1);
    }

    return clean;
  }

  return value;
};

export const getClientIp = (req) => {
  const forwarded = req?.headers?.["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req?.ip || req?.socket?.remoteAddress || "unknown";
};

const normalizeError = (error) => {
  if (!error) return null;

  return {
    name: error.name,
    message: error.message,
    code: error.code,
    status: error.status,
    stack: isProduction ? undefined : error.stack,
  };
};

export const logger = {
  info(message, meta = {}) {
    console.info(message, redactSensitiveData(meta));
  },

  warn(message, meta = {}) {
    console.warn(message, redactSensitiveData(meta));
  },

  error(message, error = null, meta = {}) {
    console.error(
      message,
      redactSensitiveData({
        error: normalizeError(error),
        ...meta,
      })
    );
  },
};