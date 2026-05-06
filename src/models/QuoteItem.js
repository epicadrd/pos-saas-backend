import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Quote } from "./Quote.js";
import { Product } from "./Product.js";
import { Tenant } from "./Tenant.js";

export const QuoteItem = sequelize.define("QuoteItem", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  quoteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  productId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  productName: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },

  price: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  discount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  subtotal: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  tax: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  isTaxable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },

  taxRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 18,
  },

  total: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
});

Tenant.hasMany(QuoteItem, { foreignKey: "tenantId" });
QuoteItem.belongsTo(Tenant, { foreignKey: "tenantId" });

Quote.hasMany(QuoteItem, { foreignKey: "quoteId", as: "items" });
QuoteItem.belongsTo(Quote, { foreignKey: "quoteId" });

Product.hasMany(QuoteItem, { foreignKey: "productId" });
QuoteItem.belongsTo(Product, { foreignKey: "productId" });