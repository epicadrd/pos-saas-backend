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

const router = express.Router();

router.get("/", protect, getQuotes);
router.get("/:id", protect, getQuoteById);

router.post("/", protect, createQuote);

router.patch("/:id/status", protect, updateQuoteStatus);
router.post("/:id/convert-to-invoice", protect, convertQuoteToInvoice);

router.delete("/:id", protect, deleteQuote);

router.put("/:id", protect, updateQuote);

export default router;