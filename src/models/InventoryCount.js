import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";
import { User } from "./User.js";

export const InventoryCount = sequelize.define("InventoryCount", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },

  name: { type: DataTypes.STRING, allowNull: false },

  status: {
    type: DataTypes.ENUM("draft", "completed", "applied"),
    allowNull: false,
    defaultValue: "draft",
  },

  notes: { type: DataTypes.TEXT, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
  appliedAt: { type: DataTypes.DATE, allowNull: true },
});

Tenant.hasMany(InventoryCount, { foreignKey: "tenantId" });
InventoryCount.belongsTo(Tenant, { foreignKey: "tenantId" });

User.hasMany(InventoryCount, { foreignKey: "createdBy", as: "inventoryCounts" });
InventoryCount.belongsTo(User, { foreignKey: "createdBy", as: "creator" });