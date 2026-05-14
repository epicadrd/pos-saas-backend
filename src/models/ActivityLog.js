import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const ActivityLog = sequelize.define("ActivityLog", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  module: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  action: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  description: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
});