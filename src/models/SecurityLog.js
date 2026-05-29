import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const SecurityLog = sequelize.define("SecurityLog", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  event: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  level: {
    type: DataTypes.ENUM("info", "warning", "critical"),
    allowNull: false,
    defaultValue: "info",
  },

  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
});