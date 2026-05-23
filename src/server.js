import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import billingRoutes from "./routes/billingRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import quoteRoutes from "./routes/quoteRoutes.js";
import deliveryNoteRoutes from "./routes/deliveryNoteRoutes.js";
import receiptRoutes from "./routes/receiptRoutes.js";
import purchaseOrderRoutes from "./routes/purchaseOrderRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import activityLogRoutes from "./routes/activityLogRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import { sequelize } from "./models/index.js";
import accountingRoutes from "./routes/accountingRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";

dotenv.config();

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

const allowedOrigins = (process.env.APP_URL || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim());

console.log("✅ CORS permitidos:", allowedOrigins);

app.use(
  cors({
    origin(origin, callback) {
      console.log("🌍 Origin recibido:", origin);

      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(cookieParser());

/*
  IMPORTANTE:
  Stripe webhook debe ir ANTES de express.json(),
  porque Stripe necesita el raw body para validar la firma.
*/
app.use("/api/webhooks", webhookRoutes);

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "POS SaaS Backend funcionando correctamente",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/products", productRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/delivery-notes", deliveryNoteRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/users", userRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/expenses", expenseRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Ruta no encontrada",
  });
});

app.use((error, req, res, next) => {
  console.error("GLOBAL ERROR:", error);

  res.status(error.status || 500).json({
    message:
      process.env.NODE_ENV === "production"
        ? "Error interno del servidor"
        : error.message || "Error interno del servidor",
  });
});

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Base de datos conectada");

    await sequelize.sync();
    console.log("✅ Modelos sincronizados");

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Error iniciando servidor:", error);
    process.exit(1);
  }
};

startServer();