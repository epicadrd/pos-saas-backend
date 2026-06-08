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

const router = express.Router();

router.get("/", protect, requireActiveSubscription, requireRole("master", "admin", "employee"), getProducts);
router.get("/:id/movements", protect, requireActiveSubscription, requireRole("master", "admin"), getProductMovements);

router.post("/", protect, requireActiveSubscription, requireRole("master", "admin"), createProduct);

router.post("/:id/movements", protect, requireActiveSubscription, requireRole("master", "admin"), createStockMovement);

router.post("/import", protect, requireActiveSubscription, requireRole("master", "admin"), importProducts);

router.put("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), updateProduct);

router.patch("/:id/reactivate", protect, requireActiveSubscription, requireRole("master", "admin"), reactivateProduct);

router.delete("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), deleteProduct);

export default router;