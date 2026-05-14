import express from "express";
import {
  createProduct,
  createStockMovement,
  deleteProduct,
  getProductMovements,
  getProducts,
  reactivateProduct,
  updateProduct,
} from "../controllers/productController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getProducts);
router.get("/:id/movements", protect, requireActiveSubscription, getProductMovements);

router.post("/", protect, requireActiveSubscription, createProduct);
router.post("/:id/movements", protect, requireActiveSubscription,  createStockMovement);

router.put("/:id", protect, requireActiveSubscription, updateProduct);

router.patch("/:id/reactivate", protect, requireActiveSubscription, reactivateProduct);

router.delete("/:id", protect, requireActiveSubscription, deleteProduct);

export default router;