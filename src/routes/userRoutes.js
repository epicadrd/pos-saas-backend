import express from "express";
import {
  createUser,
  deactivateUser,
  getUsers,
  updateUser,
} from "../controllers/userController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";
import { requireUserLimit } from "../middlewares/planMiddleware.js";

const router = express.Router();

router.get("/", protect, requireRole("master"), requireActiveSubscription, getUsers);
router.post("/", protect, requireRole("master"), requireActiveSubscription, requireUserLimit,createUser);
router.put("/:id", protect, requireRole("master"), requireActiveSubscription, updateUser);
router.patch("/:id/deactivate", protect, requireRole("master"), requireActiveSubscription, deactivateUser);

export default router;