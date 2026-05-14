import express from "express";
import {
  createCustomer,
  deleteCustomer,
  getCustomers,
  updateCustomer,
} from "../controllers/customerController.js";
import { protect } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getCustomers);
router.post("/", protect, requireActiveSubscription, createCustomer);
router.put("/:id", protect, requireActiveSubscription, updateCustomer);
router.delete("/:id", protect, requireActiveSubscription, deleteCustomer);

export default router;