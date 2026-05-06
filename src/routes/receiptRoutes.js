import express from "express";
import {
  createReceipt,
  deleteReceipt,
  getReceipts,
} from "../controllers/receiptController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getReceipts);
router.post("/", protect, createReceipt);
router.delete("/:id", protect, deleteReceipt);

export default router;