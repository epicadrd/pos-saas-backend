export const PLAN_IDS = {
  EMPRENDEDOR: "emprendedor",
  PYME: "pyme",
  PRO: "empresarial", // Internamente queda empresarial, comercialmente es PRO
};

export const PLAN_LIMITS = {
  emprendedor: {
    name: "Emprendedor",
    users: 2,
    cashRegisters: 0,
    features: [
      "invoices",
      "quotes",
      "receipts",
      "accounting",
      "customers",
      "electronicInvoices",
    ],
  },

  pyme: {
    name: "PyME",
    users: 3,
    cashRegisters: 1,
    features: [
      "invoices",
      "quotes",
      "receipts",
      "accounting",
      "customers",
      "electronicInvoices",
      "inventory",
      "inventoryCount",
      "catalog",
      "pos",
      "activityLog",
    ],
  },

  empresarial: {
    name: "Pro",
    users: 6,
    cashRegisters: 2,
    features: [
      "invoices",
      "quotes",
      "receipts",
      "accounting",
      "customers",
      "electronicInvoices",
      "inventory",
      "inventoryCount",
      "catalog",
      "pos",
      "activityLog",
      "deliveryNotes",
      "purchaseOrders",
      "suppliers",
    ],
  },
};

export const getPlanConfig = (plan) => {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.emprendedor;
};

export const planHasFeature = (plan, feature) => {
  return getPlanConfig(plan).features.includes(feature);
};