import express from "express";
import {
  createPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrders,
  updatePurchaseOrderStatus,
} from "../controllers/purchaseOrderController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getPurchaseOrders);
router.post("/", protect, createPurchaseOrder);
router.patch("/:id/status", protect, updatePurchaseOrderStatus);
router.delete("/:id", protect, deletePurchaseOrder);

export default router;