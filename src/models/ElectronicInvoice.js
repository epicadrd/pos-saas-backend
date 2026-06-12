import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Invoice } from "./Invoice.js";
import { Tenant } from "./Tenant.js";

export const ElectronicInvoice = sequelize.define("ElectronicInvoice", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  invoiceId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  environment: {
    type: DataTypes.ENUM("TesteCF", "CerteCF", "eCF"),
    allowNull: false,
    defaultValue: "TesteCF",
  },

  documentType: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  eNcf: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  internalTrackId: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  securityCode: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  qrUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  signedDate: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  signedXml: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Pendiente",
  },

  dgiiResponse: {
    type: DataTypes.JSON,
    allowNull: true,
  },

  rawResponse: {
    type: DataTypes.JSON,
    allowNull: true,
  },
});

Tenant.hasMany(ElectronicInvoice, { foreignKey: "tenantId" });
ElectronicInvoice.belongsTo(Tenant, { foreignKey: "tenantId" });

Invoice.hasOne(ElectronicInvoice, {
  foreignKey: "invoiceId",
  as: "electronicInvoice",
});

ElectronicInvoice.belongsTo(Invoice, {
  foreignKey: "invoiceId",
  as: "invoice",
});