import express from "express";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
} from "../controllers/expenseController.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, requireRole("master", "admin"), getExpenses);
router.get("/stats", protect, requireActiveSubscription, requireRole("master", "admin"), getExpenseStats);
router.post("/", protect, requireActiveSubscription, requireRole("master", "admin"), createExpense);
router.put("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), updateExpense);
router.delete("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), deleteExpense);

export default router;