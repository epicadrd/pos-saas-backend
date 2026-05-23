import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { getAccountsPayable } from "../controllers/accountsPayableController.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getAccountsPayable);

export default router;