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
import { requirePlanFeature } from "../middlewares/planMiddleware.js";

const router = express.Router();

router.get(
  "/",
  protect,
  requireActiveSubscription,
  requirePlanFeature("inventoryCount"),
  requireRole("master", "admin"),
  getInventoryCounts
);

router.get(
  "/:id",
  protect,
  requireActiveSubscription,
  requirePlanFeature("inventoryCount"),
  requireRole("master", "admin"),
  getInventoryCountById
);

router.post(
  "/",
  protect,
  requireActiveSubscription,
  requirePlanFeature("inventoryCount"),
  requireRole("master", "admin"),
  createInventoryCount
);

router.put(
  "/:id",
  protect,
  requireActiveSubscription,
  requirePlanFeature("inventoryCount"),
  requireRole("master", "admin"),
  updateInventoryCount
);

router.post(
  "/:id/apply",
  protect,
  requireActiveSubscription,
  requirePlanFeature("inventoryCount"),
  requireRole("master", "admin"),
  applyInventoryCount
);

router.delete(
  "/:id",
  protect,
  requireActiveSubscription,
  requirePlanFeature("inventoryCount"),
  requireRole("master", "admin"),
  deleteInventoryCount
);

export default router;