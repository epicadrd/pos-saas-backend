import express from "express";
import {
  createUser,
  deactivateUser,
  getUsers,
  updateUser,
} from "../controllers/userController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, requireRole("master"), getUsers);
router.post("/", protect, requireRole("master"), createUser);
router.put("/:id", protect, requireRole("master"), updateUser);
router.patch("/:id/deactivate", protect, requireRole("master"), deactivateUser);

export default router;