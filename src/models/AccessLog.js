import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const AccessLog = sequelize.define("AccessLog", {
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

  method: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  path: {
    type: DataTypes.TEXT,
    allowNull: false,
  },

  statusCode: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  responseTimeMs: {
    type: DataTypes.INTEGER,
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

  requestId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});