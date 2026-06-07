import express from "express";
import {
  generateCatalogLink,
  getCatalogSettings,
  getPublicCatalog,
} from "../controllers/catalogController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/public/:token", getPublicCatalog);

router.get(
  "/settings",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  getCatalogSettings
);

router.post(
  "/generate-link",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  generateCatalogLink
);

export default router;