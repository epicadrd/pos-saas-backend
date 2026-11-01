import express from "express";
import {
  createCustomer,
  deleteCustomer,
  getCustomerProfile,
  getCustomers,
  reactivateCustomer,
  updateCustomer,
} from "../controllers/customerController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getCustomers);
router.get("/:id/profile", protect, requireActiveSubscription, getCustomerProfile);
router.post("/", protect, requireActiveSubscription, createCustomer);
router.put("/:id", protect, requireActiveSubscription, updateCustomer);
router.delete("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), deleteCustomer);
router.patch("/:id/reactivate", protect, requireActiveSubscription, requireRole("master", "admin"), reactivateCustomer);

export default router;