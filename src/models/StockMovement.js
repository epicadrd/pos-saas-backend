import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";
import { Product } from "./Product.js";
import { User } from "./User.js";

export const StockMovement = sequelize.define("StockMovement", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: true },

  type: {
    type: DataTypes.ENUM("entry", "exit", "adjustment", "return", "waste"),
    allowNull: false,
  },

  quantity: { type: DataTypes.INTEGER, allowNull: false },
  previousStock: { type: DataTypes.INTEGER, allowNull: false },
  newStock: { type: DataTypes.INTEGER, allowNull: false },

  reason: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Movimiento manual",
  },

  referenceType: {
    type: DataTypes.ENUM(
      "manual",
      "invoice",
      "delivery_note",
      "purchase_order",
      "receipt",
      "system"
    ),
    allowNull: false,
    defaultValue: "manual",
  },

  referenceId: { type: DataTypes.INTEGER, allowNull: true },
  referenceNumber: { type: DataTypes.STRING, allowNull: true },
});

Tenant.hasMany(StockMovement, { foreignKey: "tenantId" });
StockMovement.belongsTo(Tenant, { foreignKey: "tenantId" });

Product.hasMany(StockMovement, { foreignKey: "productId", as: "movements" });
StockMovement.belongsTo(Product, { foreignKey: "productId" });

User.hasMany(StockMovement, { foreignKey: "userId", as: "stockMovements" });
StockMovement.belongsTo(User, { foreignKey: "userId", as: "user" });