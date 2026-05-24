import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";

export const Expense = sequelize.define("Expense", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  expenseNumber: { type: DataTypes.STRING, allowNull: false },
  ncf: { type: DataTypes.STRING, allowNull: true },

  category: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: false },

  supplierName: { type: DataTypes.STRING, allowNull: true },
  supplierRnc: { type: DataTypes.STRING, allowNull: true },

supplierId: {
  type: DataTypes.INTEGER,
  allowNull: true,
},

  expenseDate: { type: DataTypes.DATEONLY, allowNull: false },

  paymentMethod: {
    type: DataTypes.ENUM("cash", "card", "transfer", "check", "credit", "other"),
    defaultValue: "cash",
  },

  subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  tax: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

  status: {
    type: DataTypes.ENUM("paid", "pending", "cancelled"),
    defaultValue: "paid",
  },

  notes: { type: DataTypes.TEXT, allowNull: true },

  createdBy: { type: DataTypes.INTEGER, allowNull: true },
  updatedBy: { type: DataTypes.INTEGER, allowNull: true },


});

Tenant.hasMany(Expense, { foreignKey: "tenantId" });
Expense.belongsTo(Tenant, { foreignKey: "tenantId" });