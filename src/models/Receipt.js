import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";
import { Invoice } from "./Invoice.js";

export const Receipt = sequelize.define("Receipt", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  invoiceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  receiptNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  customerName: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  concept: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Pago de factura",
  },

  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  paymentMethod: {
    type: DataTypes.ENUM("cash", "transfer", "card", "check", "other"),
    defaultValue: "cash",
  },

  reference: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  status: {
    type: DataTypes.ENUM("paid", "cancelled"),
    defaultValue: "paid",
  },
});

Tenant.hasMany(Receipt, { foreignKey: "tenantId" });
Receipt.belongsTo(Tenant, { foreignKey: "tenantId" });

Invoice.hasMany(Receipt, { foreignKey: "invoiceId", as: "receipts" });
Receipt.belongsTo(Invoice, { foreignKey: "invoiceId" });