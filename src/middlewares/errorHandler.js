import { logger } from "../utils/secureLogger.js";

const isProduction = process.env.NODE_ENV === "production";

export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    message: "Ruta no encontrada",
  });
};

export const errorHandler = (error, req, res, next) => {
  const statusCode = error.status || error.statusCode || 500;

  logger.error("GLOBAL_ERROR", error, {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl || req.url,
    userId: req.user?.id || null,
    tenantId: req.user?.tenantId || null,
  });

  return res.status(statusCode).json({
    message:
      isProduction && statusCode >= 500
        ? "Error interno del servidor"
        : error.message || "Error interno del servidor",
  });
};