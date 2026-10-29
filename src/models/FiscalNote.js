import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

/*
 * Nota de crédito (E34) o de débito (E33) sobre una factura ya enviada
 * a la DGII. Las líneas se guardan con sus montos ya calculados.
 */
export const FiscalNote = sequelize.define(
  "FiscalNote",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    invoiceId: { type: DataTypes.INTEGER, allowNull: false },

    noteType: {
      type: DataTypes.ENUM("credit", "debit"),
      allowNull: false,
    },

    // 1 anulación total, 3 corrección de montos
    modificationCode: {
      type: DataTypes.STRING(1),
      allowNull: false,
    },

    reason: { type: DataTypes.STRING(255), allowNull: false },

    // Datos del comprobante modificado al momento de crear la nota
    referenceENcf: { type: DataTypes.STRING(13), allowNull: false },
    referenceDate: { type: DataTypes.DATEONLY, allowNull: false },
    customerName: { type: DataTypes.STRING(150), allowNull: true },
    customerRnc: { type: DataTypes.STRING(30), allowNull: true },

    // Moneda y tasa de la factura modificada
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: "DOP" },
    exchangeRate: { type: DataTypes.DECIMAL(12, 4), allowNull: true },

    lines: { type: DataTypes.JSON, allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    tax: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

    noteDate: { type: DataTypes.DATEONLY, allowNull: false },

    eNcf: { type: DataTypes.STRING(13), allowNull: true },
    tipoeCF: { type: DataTypes.STRING(2), allowNull: false },
    electronicInvoiceStatus: { type: DataTypes.STRING(60), allowNull: true },
    dgiiQrUrl: { type: DataTypes.TEXT, allowNull: true },
    securityCode: { type: DataTypes.STRING(30), allowNull: true },
    signedDate: { type: DataTypes.STRING(30), allowNull: true },
    sequenceExpirationDate: { type: DataTypes.DATEONLY, allowNull: true },

    // Cuando la nota ya se aplicó a la factura (anulación o saldo)
    appliedAt: { type: DataTypes.DATE, allowNull: true },

    createdBy: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: "FiscalNotes",
    indexes: [{ fields: ["tenantId", "invoiceId"], name: "fiscal_notes_invoice" }],
  }
);
