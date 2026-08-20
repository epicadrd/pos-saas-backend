import express from "express";
import {
  createProduct,
  createStockMovement,
  deleteProduct,
  getProductMovements,
  getProducts,
  importProducts,
  reactivateProduct,
  updateProduct,
} from "../controllers/productController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { requirePlanFeature } from "../middlewares/planMiddleware.js";

const router = express.Router();

router.get(
  "/invoice-options",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin", "employee"),
  getProducts
);

router.post(
  "/from-invoice",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin", "employee"),
  createProduct
);

router.get("/", protect, requireActiveSubscription, requirePlanFeature("inventory"), requireRole("master", "admin", "employee"), getProducts);

router.get("/:id/movements", protect, requireActiveSubscription, requirePlanFeature("inventory"), requireRole("master", "admin"), getProductMovements);

router.post("/", protect, requireActiveSubscription, requirePlanFeature("inventory"), requireRole("master", "admin"), createProduct);

router.post("/:id/movements", protect, requireActiveSubscription,requirePlanFeature("inventory"),  requireRole("master", "admin"), createStockMovement);

router.post("/import", protect, requireActiveSubscription, requirePlanFeature("inventory"), requireRole("master", "admin"), importProducts);

router.put("/:id", protect, requireActiveSubscription, requirePlanFeature("inventory"), requireRole("master", "admin"), updateProduct);

router.patch("/:id/reactivate", protect, requireActiveSubscription, requirePlanFeature("inventory"), requireRole("master", "admin"), reactivateProduct);

router.delete("/:id", protect, requireActiveSubscription, requirePlanFeature("inventory"), requireRole("master", "admin"), deleteProduct);

export default router;