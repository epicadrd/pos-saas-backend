import { Tenant, User, CashRegister } from "../models/index.js";
import { getPlanConfig, planHasFeature } from "../config/plans.js";

export const loadTenantPlan = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.user.tenantId);

    if (!tenant) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    req.tenant = tenant;
    req.plan = getPlanConfig(tenant.plan);

    next();
  } catch (error) {
    console.log("LOAD TENANT PLAN ERROR:", error);
    return res.status(500).json({
      message: "Error validando plan",
    });
  }
};

export const requirePlanFeature = (feature) => {
  return async (req, res, next) => {
    try {
      const tenant = req.tenant || (await Tenant.findByPk(req.user.tenantId));

      if (!tenant) {
        return res.status(404).json({
          message: "Empresa no encontrada",
        });
      }

      if (!planHasFeature(tenant.plan, feature)) {
        return res.status(403).json({
          code: "PLAN_FEATURE_BLOCKED",
          feature,
          message: "Esta función no está incluida en tu plan actual.",
        });
      }

      req.tenant = tenant;
      req.plan = getPlanConfig(tenant.plan);

      next();
    } catch (error) {
      console.log("REQUIRE PLAN FEATURE ERROR:", error);
      return res.status(500).json({
        message: "Error validando acceso del plan",
      });
    }
  };
};

export const requireUserLimit = async (req, res, next) => {
  try {
    const tenant = req.tenant || (await Tenant.findByPk(req.user.tenantId));
    const plan = getPlanConfig(tenant.plan);

    const activeUsers = await User.count({
      where: {
        tenantId: req.user.tenantId,
        isActive: true,
      },
    });

    if (activeUsers >= plan.users) {
      return res.status(403).json({
        code: "PLAN_USER_LIMIT",
        message: `Tu plan permite hasta ${plan.users} usuarios activos.`,
      });
    }

    next();
  } catch (error) {
    console.log("REQUIRE USER LIMIT ERROR:", error);
    return res.status(500).json({
      message: "Error validando límite de usuarios",
    });
  }
};

export const requireCashRegisterLimit = async (req, res, next) => {
  try {
    const tenant = req.tenant || (await Tenant.findByPk(req.user.tenantId));
    const plan = getPlanConfig(tenant.plan);

    const activeCashRegisters = await CashRegister.count({
      where: {
        tenantId: req.user.tenantId,
        isActive: true,
      },
    });

    if (activeCashRegisters >= plan.cashRegisters) {
      return res.status(403).json({
        code: "PLAN_CASH_REGISTER_LIMIT",
        message: `Tu plan permite hasta ${plan.cashRegisters} punto(s) de venta.`,
      });
    }

    next();
  } catch (error) {
    console.log("REQUIRE CASH REGISTER LIMIT ERROR:", error);
    return res.status(500).json({
      message: "Error validando límite de puntos de venta",
    });
  }
};