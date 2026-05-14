import express from "express";
import {
  createPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrders,
  updatePurchaseOrderStatus,
} from "../controllers/purchaseOrderController.js";
import { protect } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getPurchaseOrders);
router.post("/", protect, requireActiveSubscription, createPurchaseOrder);
router.patch("/:id/status", protect, requireActiveSubscription, updatePurchaseOrderStatus);
router.delete("/:id", protect, requireActiveSubscription, deletePurchaseOrder);

export default router;