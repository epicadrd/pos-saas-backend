import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const Tenant = sequelize.define("Tenant", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  businessName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  rnc: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
    email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  subscriptionStatus: {
    type: DataTypes.ENUM(
      "inactive",
      "trialing",
      "active",
      "past_due",
      "unpaid",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "paused"
    ),
    defaultValue: "inactive",
  },

  trialEligible: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  trialUsed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  trialBillingPeriod: {
    type: DataTypes.ENUM("monthly", "annual"),
    allowNull: true,
  },

  stripeCustomerId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  stripeSubscriptionId: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  logoDataUrl: {
  type: DataTypes.TEXT("long"),
  allowNull: true,
},
primaryColor: {
  type: DataTypes.STRING,
  allowNull: true,
  defaultValue: "#6d4aff",
},

invoiceTaxEnabled: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: true,
},

invoiceTaxMode: {
  type: DataTypes.ENUM("global", "line"),
  allowNull: false,
  defaultValue: "global",
},

invoiceTaxRate: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
  defaultValue: 18,
},

country: {
  type: DataTypes.ENUM("DO", "US"),
  allowNull: false,
  defaultValue: "DO",
},

electronicInvoicingEnabled: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: false,
},

usStateTaxRate: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
  defaultValue: 0,
},

usCountyTaxRate: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
  defaultValue: 0,
},

usCityTaxRate: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
  defaultValue: 0,
},

invoicePrefix: {
  type: DataTypes.STRING,
  allowNull: false,
  defaultValue: "FAC",
},

invoiceNextNumber: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 1,
},

invoiceDigits: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 6,
},

defaultInvoiceNotes: {
  type: DataTypes.TEXT,
  allowNull: true,
  defaultValue: null,
},

deliveryNotePrefix: {
  type: DataTypes.STRING,
  allowNull: false,
  defaultValue: "CON",
},

deliveryNoteNextNumber: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 1,
},

deliveryNoteDigits: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 6,
},

plan: {
  type: DataTypes.ENUM("emprendedor", "pyme", "empresarial"),
  allowNull: true,
},

featureOverrides: {
  type: DataTypes.JSON,
  allowNull: true,
  defaultValue: null,
},

additionalUsers: {
  type: DataTypes.INTEGER.UNSIGNED,
  allowNull: false,
  defaultValue: 0,
},

stripePriceId: {
  type: DataTypes.STRING,
  allowNull: true,
},

subscriptionCurrentPeriodEnd: {
  type: DataTypes.DATE,
  allowNull: true,
},

paymentGraceEndsAt: {
  type: DataTypes.DATE,
  allowNull: true,
},

cancelAtPeriodEnd: {
  type: DataTypes.BOOLEAN,
  defaultValue: false,
},

subscriptionCancelAt: {
  type: DataTypes.DATE,
  allowNull: true,
},

legalName: {
  type: DataTypes.STRING,
  allowNull: true,
},

companyType: {
  type: DataTypes.STRING,
  allowNull: true,
},

website: {
  type: DataTypes.STRING,
  allowNull: true,
},

industry: {
  type: DataTypes.STRING,
  allowNull: true,
},

legalAddress: {
  type: DataTypes.TEXT,
  allowNull: true,
},

clientEmail: {
  type: DataTypes.STRING,
  allowNull: true,
},

clientAddress: {
  type: DataTypes.TEXT,
  allowNull: true,
},

catalogToken: {
  type: DataTypes.STRING,
  allowNull: true,
  unique: true,
},

catalogEnabled: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: true,
},

});