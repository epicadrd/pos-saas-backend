import jwt from "jsonwebtoken";
import { User, Tenant } from "../models/index.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    if (!decoded?.id || !decoded?.tenantId) {
      return res.status(401).json({ message: "Token inválido" });
    }

    const user = await User.findOne({
      where: {
        id: decoded.id,
        tenantId: decoded.tenantId,
        isActive: true,
      },
      include: [{ model: Tenant }],
    });

    if (!user) {
      return res.status(401).json({
        message: "Usuario no autorizado o desactivado",
      });
    }

    if (!user.Tenant) {
      return res.status(403).json({
        message: "Empresa no válida",
      });
    }

    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      name: user.name,
    };

    req.tenantId = user.tenantId;
    req.tenant = user.Tenant;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token inválido o expirado",
    });
  }
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autorizado" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "No tienes permiso para realizar esta acción",
      });
    }

    next();
  };
};