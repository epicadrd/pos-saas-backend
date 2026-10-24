import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

/*
 * Rango de e-NCF autorizado por la DGII a una empresa.
 * Los números se asignan en orden desde nextNumber; el rango no se
 * expande en filas. Cada número usado queda en FiscalNumberUsage.
 */
export const FiscalSequence = sequelize.define(
  "FiscalSequence",
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

    // Un rango de pruebas nunca se usa en producción ni al revés
    environment: {
      type: DataTypes.ENUM("TesteCF", "CerteCF", "eCF"),
      allowNull: false,
    },

    tipoECF: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },

    rangeStart: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    rangeEnd: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    nextNumber: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    expirationDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM("active", "exhausted", "disabled"),
      allowNull: false,
      defaultValue: "active",
    },

    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    disabledBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    disabledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "FiscalSequences",
    indexes: [
      {
        fields: ["tenantId", "environment", "tipoECF", "status"],
        name: "fiscal_sequences_lookup",
      },
    ],
  }
);
