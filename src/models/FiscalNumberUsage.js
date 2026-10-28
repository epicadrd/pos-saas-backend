import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

/*
 * Cada e-NCF asignado a un documento. El índice único impide que el
 * mismo número se use dos veces en el mismo entorno.
 *
 * Estados:
 * - RESERVED: asignado; el envío a MSeller no se ha confirmado
 *   (no se intentó o terminó sin respuesta).
 * - FAILED: MSeller rechazó la solicitud; no llegó a la DGII y el
 *   mismo documento puede reintentarse con este número.
 * - SENT: MSeller lo firmó y lo envió; falta la respuesta de la DGII.
 * - ACCEPTED / REJECTED: respuesta final de la DGII.
 * - VOIDED: el número quedó sin usar (documento anulado o secuencia
 *   vencida) y debe anularse ante la DGII.
 */
export const FiscalNumberUsage = sequelize.define(
  "FiscalNumberUsage",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    tenantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    sequenceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    environment: {
      type: DataTypes.ENUM("TesteCF", "CerteCF", "eCF"),
      allowNull: false,
    },

    tipoECF: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },

    eNcf: {
      type: DataTypes.STRING(13),
      allowNull: false,
    },

    documentType: {
      type: DataTypes.ENUM("invoice", "pos_sale", "fiscal_note"),
      allowNull: false,
    },

    documentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM(
        "RESERVED",
        "FAILED",
        "SENT",
        "ACCEPTED",
        "REJECTED",
        "VOIDED"
      ),
      allowNull: false,
      defaultValue: "RESERVED",
    },

    msellerStatus: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },

    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    voidReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    reservedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    lastAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "FiscalNumberUsages",
    indexes: [
      {
        unique: true,
        fields: ["tenantId", "environment", "eNcf"],
        name: "fiscal_number_usages_unique_encf",
      },
      {
        fields: ["tenantId", "documentType", "documentId"],
        name: "fiscal_number_usages_document",
      },
      {
        fields: ["tenantId", "status"],
        name: "fiscal_number_usages_status",
      },
    ],
  }
);
