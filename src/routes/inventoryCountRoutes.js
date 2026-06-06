import express from "express";
import {
  applyInventoryCount,
  createInventoryCount,
  deleteInventoryCount,
  getInventoryCountById,
  getInventoryCounts,
  updateInventoryCount,
} from "../controllers/inventoryCountController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get(
  "/",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  getInventoryCounts
);

router.get(
  "/:id",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  getInventoryCountById
);

router.post(
  "/",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  createInventoryCount
);

router.put(
  "/:id",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  updateInventoryCount
);

router.post(
  "/:id/apply",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  applyInventoryCount
);

router.delete(
  "/:id",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  deleteInventoryCount
);

export default router;