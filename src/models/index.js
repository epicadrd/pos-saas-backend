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
import { SecurityLog } from "./SecurityLog.js";
import { AccessLog } from "./AccessLog.js";
import { InventoryCount } from "./InventoryCount.js";
import { InventoryCountItem } from "./InventoryCountItem.js";
import { CashRegister } from "./CashRegister.js";
import { CashSession } from "./CashSession.js";
import { PosSale } from "./PosSale.js";
import { PosSaleItem } from "./PosSaleItem.js";
import { CashRegisterUser } from "./CashRegisterUser.js";
import { ElectronicInvoice } from "./ElectronicInvoice.js";
import { ElectronicInvoicingRequest } from "./ElectronicInvoicingRequest.js";
import { TenantMSellerCredential } from "./TenantMSellerCredential.js";

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

CashRegister.belongsTo(User, { foreignKey: "createdBy", as: "creator" });
CashRegister.hasMany(CashSession, { foreignKey: "cashRegisterId", as: "sessions" });

CashSession.belongsTo(CashRegister, { foreignKey: "cashRegisterId", as: "cashRegister" });
CashSession.belongsTo(User, { foreignKey: "userId", as: "user" });

CashRegister.belongsToMany(User, {
  through: CashRegisterUser,
  foreignKey: "cashRegisterId",
  otherKey: "userId",
  as: "assignedUsers",
});

User.belongsToMany(CashRegister, {
  through: CashRegisterUser,
  foreignKey: "userId",
  otherKey: "cashRegisterId",
  as: "assignedCashRegisters",
});

PosSale.belongsTo(CashRegister, { foreignKey: "cashRegisterId", as: "cashRegister" });
PosSale.belongsTo(CashSession, { foreignKey: "cashSessionId", as: "cashSession" });
PosSale.belongsTo(User, { foreignKey: "userId", as: "user" });
PosSale.hasMany(PosSaleItem, { foreignKey: "posSaleId", as: "items" });

PosSaleItem.belongsTo(PosSale, { foreignKey: "posSaleId", as: "sale" });
PosSaleItem.belongsTo(Product, { foreignKey: "productId", as: "product" });

Tenant.hasOne(ElectronicInvoicingRequest, {
  foreignKey: "tenantId",
  as: "electronicInvoicingRequest",
  onDelete: "CASCADE",
});

ElectronicInvoicingRequest.belongsTo(Tenant, {
  foreignKey: "tenantId",
  as: "tenant",
});

Tenant.hasOne(TenantMSellerCredential, {
  foreignKey: "tenantId",
  as: "msellerCredential",
  onDelete: "CASCADE",
});

TenantMSellerCredential.belongsTo(Tenant, {
  foreignKey: "tenantId",
  as: "tenant",
});

export {
  sequelize,
  Tenant,
  User,
  Product,
  StockMovement,
  Invoice,
  InvoiceItem,
  ElectronicInvoice,
  ElectronicInvoicingRequest,
  TenantMSellerCredential,
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
  SecurityLog,
  AccessLog,
  InventoryCount,
  InventoryCountItem,
  CashRegister,
  CashSession,
  PosSale,
  PosSaleItem,
  CashRegisterUser,
};