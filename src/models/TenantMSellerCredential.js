
import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const TenantMSellerCredential = sequelize.define(
  "TenantMSellerCredential",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    tenantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },

    msellerEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    passwordEncrypted: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },

    passwordIv: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    passwordAuthTag: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    apiKeyEncrypted: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },

    apiKeyIv: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    apiKeyAuthTag: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    environment: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "TesteCF",
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    configuredBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    configuredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "TenantMSellerCredentials",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["tenantId"],
      },
    ],
  }
);