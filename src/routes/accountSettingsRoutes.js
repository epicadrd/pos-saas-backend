import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import {
  getAccountSettings,
  updateAccountSettings,
} from "../controllers/accountSettingsController.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getAccountSettings);
router.put("/", protect, requireActiveSubscription, updateAccountSettings);

export default router;