import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { DeliveryNote } from "./DeliveryNote.js";
import { Product } from "./Product.js";
import { Tenant } from "./Tenant.js";

export const DeliveryNoteItem = sequelize.define("DeliveryNoteItem", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  deliveryNoteId: {
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

  description: DataTypes.TEXT,
  unit: DataTypes.STRING,

  requestedQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },

  dispatchedQuantity: {
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

  total: {
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
});

Tenant.hasMany(DeliveryNoteItem, { foreignKey: "tenantId" });
DeliveryNoteItem.belongsTo(Tenant, { foreignKey: "tenantId" });

DeliveryNote.hasMany(DeliveryNoteItem, {
  foreignKey: "deliveryNoteId",
  as: "items",
});
DeliveryNoteItem.belongsTo(DeliveryNote, { foreignKey: "deliveryNoteId" });

Product.hasMany(DeliveryNoteItem, { foreignKey: "productId" });
DeliveryNoteItem.belongsTo(Product, { foreignKey: "productId" });