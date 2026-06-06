import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { InventoryCount } from "./InventoryCount.js";
import { Product } from "./Product.js";

export const InventoryCountItem = sequelize.define("InventoryCountItem", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  inventoryCountId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },

  systemStock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  countedStock: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  difference: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  notes: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

InventoryCount.hasMany(InventoryCountItem, {
  foreignKey: "inventoryCountId",
  as: "items",
});

InventoryCountItem.belongsTo(InventoryCount, {
  foreignKey: "inventoryCountId",
  as: "count",
});

Product.hasMany(InventoryCountItem, {
  foreignKey: "productId",
  as: "inventoryCountItems",
});

InventoryCountItem.belongsTo(Product, {
  foreignKey: "productId",
  as: "product",
});