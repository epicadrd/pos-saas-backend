import express from "express";
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  toggleSupplierStatus
} from "../controllers/supplierController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, requireRole("master", "admin"), getSuppliers);
router.post("/", protect, requireActiveSubscription, requireRole("master", "admin"), createSupplier);
router.put("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), updateSupplier);
router.delete("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), deleteSupplier);
router.patch("/:id/toggle", protect, requireActiveSubscription, requireRole("master", "admin"), toggleSupplierStatus);


export default router;