import { AccessLog } from "../models/index.js";
import { getClientIp, logger } from "../utils/secureLogger.js";

const shouldSkipAccessLog = (req) => {
  const path = req.originalUrl || req.url;

  return (
    path === "/" ||
    path.includes("/api/webhooks") ||
    path.includes("/api/auth/me") ||
    path.includes("/api/auth/refresh")
  );
};

export const accessLogMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on("finish", async () => {
    const responseTimeMs = Date.now() - start;

    const data = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTimeMs,
      ipAddress: getClientIp(req),
      userAgent: req.headers?.["user-agent"] || null,
      userId: req.user?.id || null,
      tenantId: req.user?.tenantId || null,
    };

    logger.info("ACCESS_LOG", data);

    if (shouldSkipAccessLog(req)) return;

    try {
      await AccessLog.create(data);
    } catch (error) {
      logger.error("ACCESS_LOG_DB_ERROR", error, {
        requestId: req.id,
        path: data.path,
      });
    }
  });

  next();
};