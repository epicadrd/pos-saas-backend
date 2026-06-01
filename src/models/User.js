import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";

export const User = sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },

  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  role: {
    type: DataTypes.ENUM("master", "admin", "employee"),
    allowNull: false,
    defaultValue: "employee",
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },

  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  emailVerified: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: false,
  },

  emailVerificationToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  emailVerificationExpires: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  passwordResetToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

Tenant.hasMany(User, { foreignKey: "tenantId" });
User.belongsTo(Tenant, { foreignKey: "tenantId" });