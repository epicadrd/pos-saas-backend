import express from "express";
import {
  createCheckoutSession,
  confirmCheckoutSession,
  createBillingPortalSession,
  retryPayment,
} from "../controllers/billingController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/checkout", protect, requireRole('master'), createCheckoutSession);
router.get("/checkout-session/:sessionId", protect, requireRole('master'), confirmCheckoutSession);
router.post("/portal", protect, requireRole('master'), createBillingPortalSession);
router.post("/retry-payment", protect, requireRole('master'), retryPayment);

export default router;