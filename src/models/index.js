import { sequelize } from "../config/database.js";
import { Tenant } from "./Tenant.js";
import { User } from "./User.js";
import { Product } from "./Product.js";
import { StockMovement } from "./StockMovement.js";
import { Invoice } from "./Invoice.js";
import { InvoiceItem } from "./InvoiceItem.js";
import { Quote } from "./Quote.js";
import { QuoteItem } from "./QuoteItem.js";
import { DeliveryNote } from "./DeliveryNote.js";
import { DeliveryNoteItem } from "./DeliveryNoteItem.js";
import { Receipt } from "./Receipt.js";
import { PurchaseOrder } from "./PurchaseOrder.js";
import { PurchaseOrderItem } from "./PurchaseOrderItem.js";
import { Customer } from "./Customer.js";
import { Supplier } from "./Supplier.js";
import { ActivityLog } from "./ActivityLog.js";
import { Expense } from "./Expense.js";

Invoice.belongsTo(User, {
  foreignKey: "createdBy",
  as: "creator",
});

Invoice.belongsTo(User, {
  foreignKey: "updatedBy",
  as: "updater",
});

Quote.belongsTo(User, {
  foreignKey: "createdBy",
  as: "creator",
});

Quote.belongsTo(User, {
  foreignKey: "updatedBy",
  as: "updater",
});

PurchaseOrder.belongsTo(User, {
  foreignKey: "createdBy",
  as: "creator",
});

PurchaseOrder.belongsTo(User, {
  foreignKey: "updatedBy",
  as: "updater",
});

PurchaseOrder.belongsTo(Supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

Supplier.hasMany(PurchaseOrder, {
  foreignKey: "supplierId",
  as: "purchaseOrders",
});

DeliveryNote.belongsTo(User, {
  foreignKey: "createdBy",
  as: "creator",
});

DeliveryNote.belongsTo(User, {
  foreignKey: "updatedBy",
  as: "updater",
});

Receipt.belongsTo(User, {
  foreignKey: "createdBy",
  as: "creator",
});

Receipt.belongsTo(User, {
  foreignKey: "updatedBy",
  as: "updater",
});

ActivityLog.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

Expense.belongsTo(User, { foreignKey: "createdBy", as: "creator" });
Expense.belongsTo(User, { foreignKey: "updatedBy", as: "updater" });

Expense.belongsTo(Supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

Supplier.hasMany(Expense, {
  foreignKey: "supplierId",
  as: "expenses",
});

export {
  sequelize,
  Tenant,
  User,
  Product,
  StockMovement,
  Invoice,
  InvoiceItem,
  Quote,
  QuoteItem,
  DeliveryNote,
  Receipt,
  PurchaseOrder,
  PurchaseOrderItem,
  Customer,
  Supplier,
  DeliveryNoteItem,
  ActivityLog,
  Expense,
};