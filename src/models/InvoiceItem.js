import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Invoice } from "./Invoice.js";
import { Product } from "./Product.js";
import { Tenant } from "./Tenant.js";

export const InvoiceItem = sequelize.define("InvoiceItem", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  invoiceId: {
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

  unitPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  discount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  tax: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  subtotal: {
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

Tenant.hasMany(InvoiceItem, { foreignKey: "tenantId" });
InvoiceItem.belongsTo(Tenant, { foreignKey: "tenantId" });

Invoice.hasMany(InvoiceItem, { foreignKey: "invoiceId", as: "items" });
InvoiceItem.belongsTo(Invoice, { foreignKey: "invoiceId" });

Product.hasMany(InvoiceItem, { foreignKey: "productId" });
InvoiceItem.belongsTo(Product, { foreignKey: "productId" });