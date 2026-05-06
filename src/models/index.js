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
};