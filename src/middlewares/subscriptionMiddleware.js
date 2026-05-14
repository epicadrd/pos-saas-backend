import { Tenant } from "../models/index.js";

export const requireActiveSubscription = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.user.tenantId);

    if (!tenant) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    const allowedStatuses = ["active", "trialing"];

    if (allowedStatuses.includes(tenant.subscriptionStatus)) {
      return next();
    }

    return res.status(403).json({
      code: "SUBSCRIPTION_REQUIRED",
      message: "Tu suscripción no está activa. Actualiza tu pago para continuar.",
    });
  } catch (error) {
    console.log("SUBSCRIPTION MIDDLEWARE ERROR:", error);

    return res.status(500).json({
      message: "Error validando suscripción",
    });
  }
};