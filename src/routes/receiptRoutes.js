import express from "express";
import {
  createReceipt,
  deleteReceipt,
  getReceipts,
} from "../controllers/receiptController.js";
import { protect } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getReceipts);
router.post("/", protect, requireActiveSubscription, createReceipt);
router.delete("/:id", protect, requireActiveSubscription, deleteReceipt);

export default router;