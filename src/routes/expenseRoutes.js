import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
} from "../controllers/expenseController.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getExpenses);
router.get("/stats", protect, requireActiveSubscription, getExpenseStats);
router.post("/", protect, requireActiveSubscription, createExpense);
router.put("/:id", protect, requireActiveSubscription, updateExpense);
router.delete("/:id", protect, requireActiveSubscription, deleteExpense);

export default router;