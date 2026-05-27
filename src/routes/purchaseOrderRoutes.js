import express from "express";
import {
  createPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrders,
  updatePurchaseOrderStatus,
} from "../controllers/purchaseOrderController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, requireRole("master", "admin"), getPurchaseOrders);
router.post("/", protect, requireActiveSubscription, requireRole("master", "admin"), createPurchaseOrder);
router.patch("/:id/status", protect, requireActiveSubscription, requireRole("master", "admin"), updatePurchaseOrderStatus);
router.delete("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), deletePurchaseOrder);

export default router;