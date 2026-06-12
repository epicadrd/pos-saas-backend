import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const PosSale = sequelize.define("PosSale", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  cashRegisterId: { type: DataTypes.INTEGER, allowNull: false },
  cashSessionId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },

  saleNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },

  subtotal: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  receiptType: {
  type: DataTypes.ENUM("consumer_final", "credit_fiscal"),
  allowNull: false,
  defaultValue: "consumer_final",
  },

  customerRnc: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },

  customerName: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  dgiiQrUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  eNcf: {
  type: DataTypes.STRING,
  allowNull: true,
  },

  tipoeCF: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  electronicInvoiceStatus: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  securityCode: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  discountTotal: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  taxTotal: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  total: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  paymentMethod: {
    type: DataTypes.ENUM("cash", "card", "transfer", "check", "mixed"),
    allowNull: false,
    defaultValue: "cash",
  },

  amountPaid: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  changeAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  status: {
    type: DataTypes.ENUM("paid", "cancelled"),
    allowNull: false,
    defaultValue: "paid",
  },
});