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
import accountingRoutes from "./routes/accountingRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import accountsReceivableRoutes from "./routes/accountsReceivableRoutes.js";
import accountsPayableRoutes from "./routes/accountsPayableRoutes.js";
import accountSettingsRoutes from "./routes/accountSettingsRoutes.js";

import { sequelize } from "./models/index.js";
import { logger } from "./utils/secureLogger.js";
import { requestIdMiddleware } from "./middlewares/requestIdMiddleware.js";
import { accessLogMiddleware } from "./middlewares/accessLogMiddleware.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import inventoryCountRoutes from "./routes/inventoryCountRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";

dotenv.config();

const app = express();

app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: [
              "'self'",
              process.env.APP_URL,
              process.env.FRONTEND_URL,
              "https://api.corexrd.com",
              "https://app.corexrd.com",
              "https://api.brevo.com",
              "https://api.stripe.com",
            ].filter(Boolean),
            upgradeInsecureRequests: [],
          },
        }
      : false,
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: {
      policy: "no-referrer",
    },
    frameguard: {
      action: "deny",
    },
    hsts: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  })
);

const allowedOrigins = (process.env.APP_URL || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim());

logger.info("CORS_ALLOWED_ORIGINS", { allowedOrigins });

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(requestIdMiddleware);
app.use(cookieParser());

/*
  IMPORTANTE:
  Stripe webhook debe ir ANTES de express.json(),
  porque Stripe necesita el raw body para validar la firma.
*/
app.use("/api/webhooks", webhookRoutes);

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

app.use(accessLogMiddleware);

if (process.env.NODE_ENV !== "test" && !isProduction) {
  app.use(morgan("dev"));
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
app.use("/api/inventory-counts", inventoryCountRoutes);
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
app.use("/api/reports", reportRoutes);
app.use("/api/accounts-receivable", accountsReceivableRoutes);
app.use("/api/accounts-payable", accountsPayableRoutes);
app.use("/api/account-settings", accountSettingsRoutes);
app.use("/api/catalog", catalogRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    logger.info("DATABASE_CONNECTED");

    await sequelize.sync();
    logger.info("MODELS_SYNCED");

    app.listen(PORT, () => {
      logger.info("SERVER_RUNNING", { port: PORT });
    });
  } catch (error) {
    logger.error("SERVER_START_ERROR", error);
    process.exit(1);
  }
};

startServer();