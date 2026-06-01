import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis.js";

const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const LOGIN_BLOCK_SECONDS = 5 * 60; // 5 minutos
const MAX_FAILED_LOGIN_ATTEMPTS = 7;

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
};

const normalizeEmail = (email) => {
  return String(email || "").trim().toLowerCase();
};

const createStore = (prefix) => {
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix,
  });
};

export const authRateLimit = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("corex:auth:general:"),
  keyGenerator: (req) => {
    return `${getClientIp(req)}:${req.method}:${req.path}`;
  },
  message: {
    message: "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
  },
});

export const loginRateLimit = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("corex:auth:login:v3:"),
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = normalizeEmail(req.body?.email);

    return `${ip}:${email || "sin-email"}`;
  },
  message: {
    message: "Demasiadas solicitudes de inicio de sesión. Intenta nuevamente en unos minutos.",
  },
});

export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("corex:auth:register:"),
  keyGenerator: (req) => {
    return getClientIp(req);
  },
  message: {
    message: "Demasiados registros desde esta conexión. Intenta más tarde.",
  },
});

export const resendVerificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("corex:auth:resend-verification:"),
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = normalizeEmail(req.body?.email);

    return `${ip}:${email || "sin-email"}`;
  },
  message: {
    message: "Has solicitado demasiados correos de verificación. Intenta más tarde.",
  },
});

export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("corex:auth:refresh:"),
  keyGenerator: (req) => {
    return getClientIp(req);
  },
  message: {
    message: "Demasiadas solicitudes de sesión. Intenta nuevamente en unos minutos.",
  },
});

const loginFailureKey = (req) => {
  const ip = getClientIp(req);
  const email = normalizeEmail(req.body?.email);

  return `corex:auth:failed-login:v3:${ip}:${email || "sin-email"}`;
};

export const loginSecurityGuard = async (req, res, next) => {
  try {
    if (!redis) return next();

    const key = loginFailureKey(req);
    const blockedUntil = await redis.get(`${key}:blockedUntil`);

    if (blockedUntil && Number(blockedUntil) > Date.now()) {
      const remainingMs = Number(blockedUntil) - Date.now();

      const minutesLeft = Math.floor(remainingMs / 60000);
      const secondsLeft = Math.ceil((remainingMs % 60000) / 1000);

      const retryMessage =
        minutesLeft > 0 ? `${minutesLeft}m ${secondsLeft}s` : `${secondsLeft}s`;

      return res.status(429).json({
        message: `Por seguridad, el acceso fue bloqueado temporalmente. Intenta nuevamente en ${retryMessage}.`,
        blockedMinutesLeft: minutesLeft,
        blockedSecondsLeft: secondsLeft,
        retryAfter: retryMessage,
      });
    }

    next();
  } catch (error) {
    console.error("LOGIN SECURITY GUARD ERROR:", error);
    next();
  }
};

export const registerLoginFailure = async (req) => {
  if (!redis) return null;

  const key = loginFailureKey(req);
  const count = await redis.incr(`${key}:count`);

  if (count === 1) {
    await redis.expire(`${key}:count`, AUTH_WINDOW_MS / 1000);
  }

  const remainingAttempts = Math.max(MAX_FAILED_LOGIN_ATTEMPTS - count, 0);

  if (count >= MAX_FAILED_LOGIN_ATTEMPTS) {
    const blockedUntil = Date.now() + LOGIN_BLOCK_SECONDS * 1000;

    await redis.set(`${key}:blockedUntil`, blockedUntil, "EX", LOGIN_BLOCK_SECONDS);
  }

  return remainingAttempts;
};

export const clearLoginFailures = async (req) => {
  if (!redis) return;

  const key = loginFailureKey(req);

  await redis.del(`${key}:count`);
  await redis.del(`${key}:blockedUntil`);
};

export const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("corex:auth:password-reset:"),
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = normalizeEmail(req.body?.email);

    return `${ip}:${email || "sin-email"}`;
  },
  message: {
    message: "Has solicitado demasiados enlaces de recuperación. Intenta más tarde.",
  },
});