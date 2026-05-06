import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";

export const Invoice = sequelize.define("Invoice", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    tenantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    customerName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    customerRnc: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    customerPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    customerEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    invoiceDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },

  dueDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },

  terms: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  subtotal: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  tax: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  total: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  amountPaid: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  balance: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  status: {
    type: DataTypes.ENUM("draft", "issued", "partial", "paid", "cancelled"),
    allowNull: false,
    defaultValue: "issued",
  },

  sourceType: {
  type: DataTypes.STRING,
  allowNull: true,
},

sourceId: {
  type: DataTypes.INTEGER,
  allowNull: true,
},

stockAlreadyMoved: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: false,
},

createdBy: {
  type: DataTypes.INTEGER,
  allowNull: true,
},

updatedBy: {
  type: DataTypes.INTEGER,
  allowNull: true,
},
});

Tenant.hasMany(Invoice, { foreignKey: "tenantId" });
Invoice.belongsTo(Tenant, { foreignKey: "tenantId" });