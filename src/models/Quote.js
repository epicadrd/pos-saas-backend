import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";

export const Quote = sequelize.define("Quote", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  quoteNumber: {
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

  validUntil: {
    type: DataTypes.DATEONLY,
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

  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

status: {
  type: DataTypes.ENUM(
    "draft",
    "sent",
    "approved",
    "rejected",
    "expired",
    "converted"
  ),
  defaultValue: "draft",
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

Tenant.hasMany(Quote, { foreignKey: "tenantId" });
Quote.belongsTo(Tenant, { foreignKey: "tenantId" });