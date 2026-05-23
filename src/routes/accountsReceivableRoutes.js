import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { getAccountsReceivable } from "../controllers/accountsReceivableController.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getAccountsReceivable);

export default router;