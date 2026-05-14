import express from "express";
import {
  createCheckoutSession,
  confirmCheckoutSession,
  createBillingPortalSession,
  retryPayment,
} from "../controllers/billingController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/checkout", protect, createCheckoutSession);
router.get("/checkout-session/:sessionId", protect, confirmCheckoutSession);
router.post("/portal", protect, createBillingPortalSession);
router.post("/retry-payment", protect, retryPayment);

export default router;