import { SecurityLog } from "../models/index.js";
import { getClientIp, logger, redactSensitiveData } from "./secureLogger.js";

export const logSecurityEvent = async ({
  req,
  user = null,
  event,
  level = "info",
  email = null,
  metadata = {},
}) => {
  try {
    await SecurityLog.create({
      tenantId: user?.tenantId || null,
      userId: user?.id || null,
      event,
      level,
      email: email || user?.email || null,
      ipAddress: getClientIp(req),
      userAgent: req?.headers?.["user-agent"] || null,
      metadata: redactSensitiveData({
        requestId: req?.id,
        method: req?.method,
        path: req?.originalUrl || req?.url,
        ...metadata,
      }),
    });
  } catch (error) {
    logger.error("SECURITY_LOG_ERROR", error, {
      event,
      userId: user?.id || null,
      tenantId: user?.tenantId || null,
    });
  }
};