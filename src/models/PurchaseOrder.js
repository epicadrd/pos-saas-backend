import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";

export const PurchaseOrder = sequelize.define("PurchaseOrder", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  orderNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  supplierName: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  supplierRnc: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  supplierPhone: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  supplierEmail: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  expectedDate: {
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
    type: DataTypes.ENUM("draft", "sent", "received", "cancelled"),
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

Tenant.hasMany(PurchaseOrder, { foreignKey: "tenantId" });
PurchaseOrder.belongsTo(Tenant, { foreignKey: "tenantId" });