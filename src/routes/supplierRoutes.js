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
import { requirePlanFeature, requireCashRegisterLimit,} from "../middlewares/planMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, requirePlanFeature("suppliers"), requireRole("master", "admin"), getSuppliers);
router.post("/", protect, requireActiveSubscription, requirePlanFeature("suppliers"), requireRole("master", "admin"), createSupplier);
router.put("/:id", protect, requireActiveSubscription, requirePlanFeature("suppliers"), requireRole("master", "admin"), updateSupplier);
router.delete("/:id", protect, requireActiveSubscription, requirePlanFeature("suppliers"), requireRole("master", "admin"), deleteSupplier);
router.patch("/:id/toggle", protect, requireActiveSubscription, requirePlanFeature("suppliers"), requireRole("master", "admin"), toggleSupplierStatus);


export default router;