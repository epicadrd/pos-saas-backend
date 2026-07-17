import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const ElectronicInvoicingRequest = sequelize.define(
  "ElectronicInvoicingRequest",
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

    certificateFileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    certificateMimeType: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    certificateSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    certificateEncrypted: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },

    certificateIv: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    certificateAuthTag: {
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

    status: {
      type: DataTypes.ENUM(
        "pending",
        "in_review",
        "configured",
        "active",
        "rejected"
      ),
      allowNull: false,
      defaultValue: "pending",
    },

    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    submittedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    submittedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    activatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["tenantId"],
      },
      {
        fields: ["status"],
      },
    ],
  }
);