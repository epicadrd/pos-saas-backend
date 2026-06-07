import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const CashSession = sequelize.define("CashSession", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  cashRegisterId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },

  openingAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  closingAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },

  expectedAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },

  difference: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },

  totalSales: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  status: {
    type: DataTypes.ENUM("open", "closed"),
    allowNull: false,
    defaultValue: "open",
  },

  openedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },

  closedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});