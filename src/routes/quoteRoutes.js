import express from "express";
import {
  createQuote,
  deleteQuote,
  getQuoteById,
  getQuotes,
  updateQuoteStatus,
  convertQuoteToInvoice,
  updateQuote,
} from "../controllers/quoteController.js";
import { protect } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getQuotes);
router.get("/:id", protect, requireActiveSubscription, getQuoteById);

router.post("/", protect, requireActiveSubscription, createQuote);

router.patch("/:id/status", protect, requireActiveSubscription, updateQuoteStatus);
router.post("/:id/convert-to-invoice", protect, requireActiveSubscription, convertQuoteToInvoice);

router.delete("/:id", protect, requireActiveSubscription, deleteQuote);

router.put("/:id", protect, requireActiveSubscription, updateQuote);

export default router;