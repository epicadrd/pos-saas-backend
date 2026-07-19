import express from "express";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
  importExpenseFromDgii,
  exportMonthlyExpenses,
} from "../controllers/expenseController.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, requireRole("master", "admin"), getExpenses);
router.get("/stats", protect, requireActiveSubscription, requireRole("master", "admin"), getExpenseStats);
router.get(
  "/export",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  exportMonthlyExpenses
);
router.post("/", protect, requireActiveSubscription, requireRole("master", "admin"), createExpense);
router.post("/import-dgii", protect, requireActiveSubscription, requireRole("master", "admin"), importExpenseFromDgii);
router.put("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), updateExpense);
router.delete("/:id", protect, requireActiveSubscription, requireRole("master", "admin"), deleteExpense);

export default router;