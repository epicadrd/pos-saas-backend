import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";

export const DeliveryNote = sequelize.define("DeliveryNote", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  deliveryNoteNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  customerName: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  customerRnc: DataTypes.STRING,
  customerPhone: DataTypes.STRING,
  customerEmail: DataTypes.STRING,
  customerAddress: DataTypes.TEXT,

  customerPurchaseOrder: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  sourceType: DataTypes.STRING,
  sourceId: DataTypes.INTEGER,

  invoiceId: DataTypes.INTEGER,

  status: {
    type: DataTypes.ENUM("draft", "issued", "delivered", "cancelled"),
    defaultValue: "draft",
  },

  warehouseName: DataTypes.STRING,

  issueDate: DataTypes.DATEONLY,
  deliveryDate: DataTypes.DATEONLY,

  driverName: DataTypes.STRING,
  driverId: DataTypes.STRING,
  vehiclePlate: DataTypes.STRING,

  deliveryAddress: DataTypes.TEXT,
  deliveryInstructions: DataTypes.TEXT,

  receivedByName: DataTypes.STRING,
  receivedById: DataTypes.STRING,
  receivedAt: DataTypes.DATE,

  subtotal: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },

  tax: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },

  total: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },

  createdBy: {
  type: DataTypes.INTEGER,
  allowNull: true,
},

  updatedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

Tenant.hasMany(DeliveryNote, { foreignKey: "tenantId" });
DeliveryNote.belongsTo(Tenant, { foreignKey: "tenantId" });