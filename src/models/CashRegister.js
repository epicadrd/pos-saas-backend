
import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const CashRegister = sequelize.define("CashRegister", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: false },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
});