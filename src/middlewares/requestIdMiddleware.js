import crypto from "crypto";

export const requestIdMiddleware = (req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
};