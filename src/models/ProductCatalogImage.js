import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const ProductCatalogImage = sequelize.define(
  "ProductCatalogImage",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    imageDataUrl: { type: DataTypes.TEXT("long"), allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  },
  {
    indexes: [
      { fields: ["tenantId", "productId"] },
      { unique: true, fields: ["productId", "position"] },
    ],
  }
);