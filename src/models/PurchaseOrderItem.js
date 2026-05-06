import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { PurchaseOrder } from "./PurchaseOrder.js";
import { Product } from "./Product.js";

export const PurchaseOrderItem = sequelize.define("PurchaseOrderItem", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  purchaseOrderId: {
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

  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },

  cost: {
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

PurchaseOrder.hasMany(PurchaseOrderItem, {
  foreignKey: "purchaseOrderId",
  as: "items",
});

PurchaseOrderItem.belongsTo(PurchaseOrder, {
  foreignKey: "purchaseOrderId",
});

Product.hasMany(PurchaseOrderItem, { foreignKey: "productId" });
PurchaseOrderItem.belongsTo(Product, { foreignKey: "productId" });