const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_AUTH_REQUESTS = 20;

const LOGIN_BLOCK_MS = 10 * 60 * 1000; // 10 minutos
const MAX_FAILED_LOGIN_ATTEMPTS = 8;

const requestStore = new Map();
const failedLoginStore = new Map();

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

const cleanupExpired = (store) => {
  const now = Date.now();

  for (const [key, value] of store.entries()) {
    if (value.resetAt && value.resetAt <= now) {
      store.delete(key);
    }

    if (value.blockedUntil && value.blockedUntil <= now) {
      store.delete(key);
    }
  }
};

export const authRateLimit = (req, res, next) => {
  cleanupExpired(requestStore);

  const ip = getClientIp(req);
  const key = `${ip}:${req.path}`;
  const now = Date.now();

  const current = requestStore.get(key) || {
    count: 0,
    resetAt: now + WINDOW_MS,
  };

  current.count += 1;

  requestStore.set(key, current);

  if (current.count > MAX_AUTH_REQUESTS) {
    return res.status(429).json({
      message: "Demasiados intentos. Intenta nuevamente en unos minutos.",
    });
  }

  next();
};

export const loginSecurityGuard = (req, res, next) => {
  cleanupExpired(failedLoginStore);

  const ip = getClientIp(req);
  const email = normalizeEmail(req.body?.email);
  const key = `${ip}:${email}`;
  const record = failedLoginStore.get(key);

  if (record?.blockedUntil && record.blockedUntil > Date.now()) {
  const minutesLeft = Math.ceil(
    (record.blockedUntil - Date.now()) / 60000
  );

    return res.status(429).json({
    message: `Por seguridad, el acceso fue bloqueado temporalmente. Intenta nuevamente en ${minutesLeft} minuto(s).`,
    blockedMinutesLeft: minutesLeft,
    });
}

  next();
};

export const registerLoginFailure = (req) => {
  cleanupExpired(failedLoginStore);

  const ip = getClientIp(req);
  const email = normalizeEmail(req.body?.email);
  const key = `${ip}:${email}`;
  const now = Date.now();

  const record = failedLoginStore.get(key) || {
    count: 0,
    resetAt: now + WINDOW_MS,
    blockedUntil: null,
  };

record.count += 1;

const remainingAttempts = Math.max(
  MAX_FAILED_LOGIN_ATTEMPTS - record.count,
  0
);

if (record.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
  record.blockedUntil = now + LOGIN_BLOCK_MS;
}

failedLoginStore.set(key, record);

return remainingAttempts;
};

export const clearLoginFailures = (req) => {
  const ip = getClientIp(req);
  const email = normalizeEmail(req.body?.email);
  const key = `${ip}:${email}`;

  failedLoginStore.delete(key);
};