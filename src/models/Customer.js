import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";

export const Customer = sequelize.define("Customer", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  rnc: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  // Lista de hasta 5 correos; el principal (email) va primero.
  emails: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue("emails");
      let list = [];

      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list = parsed.filter(Boolean);
        } catch {
          list = [];
        }
      }

      const primary = this.getDataValue("email");
      if (primary && !list.includes(primary)) list.unshift(primary);

      return list;
    },
    set(value) {
      const list = Array.isArray(value) ? value.filter(Boolean) : [];
      this.setDataValue("emails", list.length ? JSON.stringify(list) : null);
    },
  },

  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
});

Tenant.hasMany(Customer, { foreignKey: "tenantId" });
Customer.belongsTo(Tenant, { foreignKey: "tenantId" });