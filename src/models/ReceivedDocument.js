import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

// e-CF que un proveedor le emitió a la empresa
export const ReceivedDocument = sequelize.define(
  "ReceivedDocument",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    eNcf: { type: DataTypes.STRING(20), allowNull: false },
    tipoECF: { type: DataTypes.STRING(2), allowNull: true },
    supplierRnc: { type: DataTypes.STRING(20), allowNull: false },
    supplierName: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.STRING(255), allowNull: true },
    issueDate: { type: DataTypes.DATEONLY, allowNull: false },
    tax: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

    status: {
      type: DataTypes.ENUM("pending", "registered", "ignored"),
      allowNull: false,
      defaultValue: "pending",
    },

    expenseId: { type: DataTypes.INTEGER, allowNull: true },
    document: { type: DataTypes.JSON, allowNull: true },
  },
  {
    tableName: "ReceivedDocuments",
    timestamps: true,
    indexes: [
      {
        name: "received_documents_unique_ncf",
        unique: true,
        fields: ["tenantId", "supplierRnc", "eNcf"],
      },
      { name: "received_documents_status", fields: ["tenantId", "status"] },
    ],
  }
);
