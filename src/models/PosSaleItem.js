import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const PosSaleItem = sequelize.define("PosSaleItem", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  posSaleId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },

  productName: {
    type: DataTypes.STRING(160),
    allowNull: false,
  },

  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  unitPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  discountAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  total: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
});