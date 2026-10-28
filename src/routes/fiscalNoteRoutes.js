import express from "express";
import {
  createFiscalNote,
  getFiscalNotes,
  retryFiscalNote,
} from "../controllers/fiscalNoteController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getFiscalNotes);
router.post("/", protect, requireActiveSubscription, createFiscalNote);
router.post("/:id/emit", protect, requireActiveSubscription, retryFiscalNote);

export default router;
