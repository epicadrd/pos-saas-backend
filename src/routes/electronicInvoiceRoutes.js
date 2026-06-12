import express from "express";
import {
  emitElectronicInvoice,
  syncElectronicInvoiceStatus,
} from "../controllers/electronicInvoiceController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.post(
  "/invoice/:id/emit",
  protect,
  requireActiveSubscription,
  emitElectronicInvoice
);

router.post(
  "/:id/sync",
  protect,
  requireActiveSubscription,
  syncElectronicInvoiceStatus
);

export default router;