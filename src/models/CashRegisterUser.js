import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const CashRegisterUser = sequelize.define("CashRegisterUser", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  cashRegisterId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
});