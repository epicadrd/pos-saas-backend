import { stripe } from "../config/stripe.js";
import { Tenant } from "../models/index.js";

const PLAN_PRICE_MAP = {
  emprendedor: process.env.STRIPE_PRICE_EMPRENDEDOR,
  pyme: process.env.STRIPE_PRICE_PYME,
  empresarial: process.env.STRIPE_PRICE_EMPRESARIAL,
};

export const createCheckoutSession = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { plan } = req.body;

    if (!PLAN_PRICE_MAP[plan]) {
      return res.status(400).json({ message: "Plan inválido" });
    }

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    let customerId = tenant.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.businessName,
        metadata: { tenantId: String(tenant.id) },
      });

      customerId = customer.id;

      await tenant.update({ stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: PLAN_PRICE_MAP[plan],
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/seleccionar-plan`,
      metadata: {
        tenantId: String(tenant.id),
        plan,
      },
      subscription_data: {
        metadata: {
          tenantId: String(tenant.id),
          plan,
        },
      },
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.log("CREATE CHECKOUT SESSION ERROR:", error);
    return res.status(500).json({ message: "Error creando sesión de pago" });
  }
};

export const confirmCheckoutSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const tenantId = req.user.tenantId;

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.latest_invoice", "subscription.items.data.price"],
    });

    if (String(session.metadata?.tenantId) !== String(tenantId)) {
      return res.status(403).json({ message: "No autorizado" });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "El pago no fue completado" });
    }

    const subscription =
     typeof session.subscription === "string"
    ? await stripe.subscriptions.retrieve(session.subscription)
    : session.subscription;

    const tenant = await Tenant.findByPk(tenantId);

    await tenant.update({
      plan: session.metadata.plan,
      subscriptionStatus: subscription.status === "active" ? "active" : subscription.status,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price?.id || null,
      subscriptionCurrentPeriodEnd:
        subscription.items?.data?.[0]?.current_period_end
          ? new Date(
              subscription.items.data[0].current_period_end * 1000
            )
          : subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
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
    const tenantId = req.user.tenantId;

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    if (!tenant.stripeCustomerId) {
      return res.status(400).json({
        message: "No tienes una suscripción activa para administrar.",
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url:
        process.env.STRIPE_BILLING_PORTAL_RETURN_URL ||
        `${process.env.APP_URL}/dashboard/facturacion/billing`,
    });

    return res.json({
      url: portalSession.url,
    });
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

    if (!tenant?.stripeCustomerId) {
      return res.status(400).json({
        message: "Cliente de Stripe no encontrado.",
      });
    }

    const invoices = await stripe.invoices.list({
      customer: tenant.stripeCustomerId,
      status: "open",
      limit: 1,
    });

    const invoice = invoices.data[0];

    if (!invoice) {
      return res.status(404).json({
        message: "No hay pagos pendientes.",
      });
    }

    await stripe.invoices.pay(invoice.id);

    return res.json({
      success: true,
      message: "Pago procesado correctamente.",
    });
  } catch (error) {
    console.log("❌ Error retry payment:", error);

    return res.status(400).json({
      message:
        "No pudimos procesar el pago. Verifica tu método de pago.",
    });
  }
};