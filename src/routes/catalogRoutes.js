import express from "express";
import {
  generateCatalogLink,
  getCatalogSettings,
  getPublicCatalog,
  addCatalogImage,
  deleteCatalogImage,
  getProductCatalogImages,
  updateMainCatalogImage,
} from "../controllers/catalogController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { requirePlanFeature } from "../middlewares/planMiddleware.js";

const router = express.Router();

router.get("/public/:token", getPublicCatalog);

router.get("/products/:productId/images", protect, requireActiveSubscription, requirePlanFeature("catalog"), requireRole("master", "admin"), getProductCatalogImages);
router.patch("/products/:productId/main-image", protect, requireActiveSubscription, requirePlanFeature("catalog"), requireRole("master", "admin"), updateMainCatalogImage);
router.post("/products/:productId/images", protect, requireActiveSubscription, requirePlanFeature("catalog"), requireRole("master", "admin"), addCatalogImage);
router.delete("/products/:productId/images/:imageId", protect, requireActiveSubscription, requirePlanFeature("catalog"), requireRole("master", "admin"), deleteCatalogImage);

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