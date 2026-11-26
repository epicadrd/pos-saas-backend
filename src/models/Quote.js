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

  customerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
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

  // Una cotización puede ir en US$; al facturar se elige la moneda y la tasa
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: "DOP",
  },

  exchangeRate: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: true,
    defaultValue: null,
  },

  // Descuento en monto sobre toda la cotización; se resta antes del ITBIS
  discountAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  // Porcentaje del descuento que se muestra junto a "Descuento"; null = no se muestra
  discountPercent: {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: true,
    defaultValue: null,
  },

  // Base del ITBIS: 100 (todo el monto) o 10 (18% sobre el 10%, Norma 07-2007)
  taxBasePercent: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
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