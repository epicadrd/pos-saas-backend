import express from "express";
import {
  login,
  logout,
  me,
  refresh,
  register,
  updateTenant,
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", me);
router.post("/refresh", refresh);
router.post("/logout", logout);

router.patch("/tenant", protect, updateTenant);

export default router;