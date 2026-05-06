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

const router = express.Router();

router.get("/", protect, getProducts);
router.get("/:id/movements", protect, getProductMovements);

router.post("/", protect, createProduct);
router.post("/:id/movements", protect, createStockMovement);

router.put("/:id", protect, updateProduct);

router.patch("/:id/reactivate", protect, reactivateProduct);

router.delete("/:id", protect, deleteProduct);

export default router;