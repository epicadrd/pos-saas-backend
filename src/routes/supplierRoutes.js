import express from "express";
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  toggleSupplierStatus
} from "../controllers/supplierController.js";
import { protect } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getSuppliers);
router.post("/", protect, requireActiveSubscription, createSupplier);
router.put("/:id", protect, requireActiveSubscription, updateSupplier);
router.delete("/:id", protect, requireActiveSubscription, deleteSupplier);
router.patch("/:id/toggle", protect, requireActiveSubscription, toggleSupplierStatus);


export default router;