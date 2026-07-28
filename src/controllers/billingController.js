import { stripe } from "../config/stripe.js";
import { Tenant } from "../models/index.js";

const PLAN_PRICE_MAP = {
  emprendedor: {
    monthly: process.env.STRIPE_PRICE_EMPRENDEDOR,
    annual: process.env.STRIPE_PRICE_EMPRENDEDOR_ANNUAL,
  },
  pyme: {
    monthly: process.env.STRIPE_PRICE_PYME,
    annual: process.env.STRIPE_PRICE_PYME_ANNUAL,
  },
  empresarial: {
    monthly: process.env.STRIPE_PRICE_EMPRESARIAL,
    annual: process.env.STRIPE_PRICE_EMPRESARIAL_ANNUAL,
  },
};

const VALID_BILLING_PERIODS = new Set(["monthly", "annual"]);

const getValidStripeCustomerId = async (tenant) => {
  let customerId = tenant.stripeCustomerId;

  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);

      if (customer?.deleted) {
        customerId = null;
        await tenant.update({ stripeCustomerId: null });
      }
    } catch (error) {
      if (error.code === "resource_missing") {
        customerId = null;
        await tenant.update({ stripeCustomerId: null });
      } else {
        throw error;
      }
    }
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: tenant.businessName || "Cliente Aventra",
      email: tenant.email || undefined,
      metadata: {
        tenantId: String(tenant.id),
      },
    });

    customerId = customer.id;
    await tenant.update({ stripeCustomerId: customerId });
  }

  return customerId;
};

export const createCheckoutSession = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { plan, billingPeriod = "monthly" } = req.body;

    if (!VALID_BILLING_PERIODS.has(billingPeriod)) {
      return res.status(400).json({
        message: "Modalidad de pago inválida",
      });
    }

    const priceId = PLAN_PRICE_MAP[plan]?.[billingPeriod];

    if (!priceId) {
      return res.status(400).json({
        message:
          billingPeriod === "annual"
            ? "El precio anual de este plan no está configurado"
            : "Plan inválido",
      });
    }

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const customerId = await getValidStripeCustomerId(tenant);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/seleccionar-plan`,
      metadata: {
        tenantId: String(tenant.id),
        plan,
        billingPeriod,
      },
      subscription_data: {
        metadata: {
          tenantId: String(tenant.id),
          plan,
          billingPeriod,
        },
      },
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.log("CREATE CHECKOUT SESSION ERROR:", {
      message: error.message,
      code: error.code,
      type: error.type,
      param: error.param,
      statusCode: error.statusCode,
      raw: error.raw,
    });

    return res.status(500).json({ message: "Error creando sesión de pago" });
  }
};

export const confirmCheckoutSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const tenantId = req.user.tenantId;

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.items.data.price"],
    });

    if (String(session.metadata?.tenantId) !== String(tenantId)) {
      return res.status(403).json({ message: "No autorizado" });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "El pago no fue completado" });
    }

    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription, {
            expand: ["items.data.price"],
          })
        : session.subscription;

    const tenant = await Tenant.findByPk(tenantId);

    await tenant.update({
      plan: session.metadata.plan,
      subscriptionStatus: subscription.status,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price?.id || null,
      subscriptionCurrentPeriodEnd:
        subscription.items?.data?.[0]?.current_period_end
          ? new Date(subscription.items.data[0].current_period_end * 1000)
          : subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      subscriptionCancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000)
        : null,
    });

    return res.json({
      message: "Suscripción activada correctamente",
      tenant,
    });
  } catch (error) {
    console.log("CONFIRM CHECKOUT SESSION ERROR:", error);
    return res.status(500).json({ message: "Error confirmando suscripción" });
  }
};

export const createBillingPortalSession = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.user.tenantId);

    if (!tenant) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    if (!tenant.stripeCustomerId) {
      return res.status(400).json({
        message: "No tienes una suscripción activa para administrar.",
      });
    }

    const customerId = await getValidStripeCustomerId(tenant);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url:
        process.env.STRIPE_BILLING_PORTAL_RETURN_URL ||
        `${process.env.APP_URL}/dashboard/facturacion/billing`,
    });

    return res.json({ url: portalSession.url });
  } catch (error) {
    console.log("CREATE BILLING PORTAL ERROR:", error);
    return res.status(500).json({
      message: "Error abriendo el portal de facturación",
    });
  }
};

export const retryPayment = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.user.tenantId);

    if (!tenant) {
      return res.status(404).json({ message: "Empresa no encontrada." });
    }

    const customerId = await getValidStripeCustomerId(tenant);

    const invoices = await stripe.invoices.list({
      customer: customerId,
      status: "open",
      limit: 10,
    });

    const invoice = invoices.data.find(
      (item) =>
        item.subscription === tenant.stripeSubscriptionId ||
        item.parent?.subscription_details?.subscription ===
          tenant.stripeSubscriptionId
    );

    if (!invoice) {
      return res.status(404).json({
        message: "No hay pagos pendientes.",
      });
    }

    const paidInvoice = await stripe.invoices.pay(invoice.id, {
      expand: ["subscription", "lines.data.price"],
    });

    const subscriptionId =
      paidInvoice.subscription ||
      paidInvoice.parent?.subscription_details?.subscription ||
      tenant.stripeSubscriptionId;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice", "items.data.price"],
    });

    const periodEnd =
      subscription.current_period_end ||
      subscription.items?.data?.[0]?.current_period_end ||
      paidInvoice.lines?.data?.[0]?.period?.end;

    await tenant.update({
      subscriptionStatus: subscription.status || "active",
      stripeCustomerId: subscription.customer || customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId:
        subscription.items?.data?.[0]?.price?.id || tenant.stripePriceId,
      subscriptionCurrentPeriodEnd: periodEnd
        ? new Date(periodEnd * 1000)
        : tenant.subscriptionCurrentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      subscriptionCancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000)
        : null,
    });

    return res.json({
      success: true,
      message: "Pago procesado correctamente. Tu suscripción fue reactivada.",
      tenant,
    });
  } catch (error) {
    console.log("❌ Error retry payment:", {
      message: error.message,
      code: error.code,
      type: error.type,
      raw: error.raw,
    });

    return res.status(400).json({
      message: "No pudimos procesar el pago. Verifica tu método de pago.",
    });
  }
};