import express from "express";
import {
  generateCatalogLink,
  getCatalogSettings,
  getPublicCatalog,
} from "../controllers/catalogController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { requirePlanFeature } from "../middlewares/planMiddleware.js";

const router = express.Router();

router.get("/public/:token", getPublicCatalog);

router.get(
  "/settings",
  protect,
  requireActiveSubscription,
  requirePlanFeature("catalog"),
  requireRole("master", "admin"),
  getCatalogSettings
);

router.post(
  "/generate-link",
  protect,
  requireActiveSubscription,
  requirePlanFeature("catalog"),
  requireRole("master", "admin"),
  generateCatalogLink
);

export default router;