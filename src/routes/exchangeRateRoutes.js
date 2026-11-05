import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { getUsdExchangeRate } from "../services/exchangeRateService.js";

const router = express.Router();

// Tasa del dólar para llenar las facturas en US$
router.get("/usd", protect, requireActiveSubscription, async (req, res) => {
  try {
    return res.json(await getUsdExchangeRate());
  } catch (error) {
    console.log("EXCHANGE RATE ERROR:", error.message);
    return res.status(503).json({
      message: "No se pudo obtener la tasa del dólar. Escríbela manualmente.",
    });
  }
});

export default router;
