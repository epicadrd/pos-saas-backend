import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";

export const Product = sequelize.define("Product", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },

  name: { type: DataTypes.STRING, allowNull: false },
  sku: { type: DataTypes.STRING, allowNull: true },
  barcode: { type: DataTypes.STRING, allowNull: true },

  description: { type: DataTypes.TEXT, allowNull: true },
  category: { type: DataTypes.STRING, allowNull: true },

  unit: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "unidad",
  },

  productType: {
    type: DataTypes.ENUM("product", "service"),
    allowNull: false,
    defaultValue: "product",
  },

  trackStock: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },

  costPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  salePrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  stock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  minStock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  imageDataUrl: {
  type: DataTypes.TEXT("long"),
  allowNull: true,
  },

  showInCatalog: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
});

Tenant.hasMany(Product, { foreignKey: "tenantId" });
Product.belongsTo(Tenant, { foreignKey: "tenantId" });