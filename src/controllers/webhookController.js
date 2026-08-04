import { stripe } from "../config/stripe.js";
import { Tenant } from "../models/index.js";

const getPeriodEnd = async (subscription) => {
  if (subscription.current_period_end) {
    return new Date(subscription.current_period_end * 1000);
  }

  if (subscription.items?.data?.[0]?.current_period_end) {
    return new Date(subscription.items.data[0].current_period_end * 1000);
  }

  if (subscription.latest_invoice) {
    const invoice =
      typeof subscription.latest_invoice === "string"
        ? await stripe.invoices.retrieve(subscription.latest_invoice)
        : subscription.latest_invoice;

    const periodEnd = invoice.lines?.data?.[0]?.period?.end;

    if (periodEnd) {
      return new Date(periodEnd * 1000);
    }
  }

  return null;
};

const syncSubscriptionToTenant = async (subscription) => {
  const tenantId = subscription.metadata?.tenantId;

  const tenant = tenantId
    ? await Tenant.findByPk(tenantId)
    : await Tenant.findOne({
        where: { stripeSubscriptionId: subscription.id },
      });
    
      

  if (!tenant) {
    console.log("⚠️ No se encontró tenant para subscription:", {
      subscriptionId: subscription.id,
      tenantId,
      customer: subscription.customer,
    });
    return;
  }

  const periodEnd = await getPeriodEnd(subscription);

  await tenant.update({
    plan: subscription.metadata?.plan || tenant.plan,
    subscriptionStatus: subscription.status,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    stripePriceId:
      subscription.items?.data?.[0]?.price?.id ||
      tenant.stripePriceId,
    subscriptionCurrentPeriodEnd: periodEnd,
    cancelAtPeriodEnd:
      subscription.cancel_at_period_end || false,
    subscriptionCancelAt: subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000)
      : null,
    trialUsed:
      subscription.metadata?.includesFreeTrial === "true"
        ? true
        : tenant.trialUsed,
  });

  console.log("✅ Tenant sincronizado con Stripe:", {
    tenantId: tenant.id,
    status: subscription.status,
    plan: subscription.metadata?.plan || tenant.plan,
    periodEnd,
  });
};

const getSubscriptionIdFromInvoice = (invoice) => {
  return (
    invoice.subscription ||
    invoice.parent?.subscription_details?.subscription ||
    null
  );
};

const syncInvoiceSubscriptionToTenant = async (invoice) => {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!subscriptionId) {
    console.log("⚠️ Invoice sin subscription:", invoice.id);
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice", "items.data.price"],
  });

  await syncSubscriptionToTenant(subscription);
};

export const handleStripeWebhook = async (req, res) => {
  let event;

  try {
    const sig = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("❌ Error webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        if (!session.subscription) {
          console.log("⚠️ Checkout completado sin subscription:", session.id);
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription,
          {
            expand: ["latest_invoice", "items.data.price"],
          }
        );

        await syncSubscriptionToTenant(subscription);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = await stripe.subscriptions.retrieve(
          event.data.object.id,
          {
            expand: ["latest_invoice", "items.data.price"],
          }
        );

        await syncSubscriptionToTenant(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const tenant = await Tenant.findOne({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (tenant) {
          await tenant.update({
            subscriptionStatus: "canceled",
            cancelAtPeriodEnd: false,
            subscriptionCancelAt: null,
          });

          console.log("🛑 Suscripción cancelada, tenant actualizado:", tenant.id);
        } else {
          console.log("⚠️ Suscripción cancelada pero no se encontró tenant:", {
            subscriptionId: subscription.id,
            customer: subscription.customer,
          });
        }

        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        await syncInvoiceSubscriptionToTenant(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = getSubscriptionIdFromInvoice(invoice);

        let tenant = null;

        if (subscriptionId) {
          tenant = await Tenant.findOne({
            where: { stripeSubscriptionId: subscriptionId },
          });
        }

        if (!tenant && invoice.customer) {
          tenant = await Tenant.findOne({
            where: { stripeCustomerId: invoice.customer },
          });
        }

        if (tenant) {
          await tenant.update({
            subscriptionStatus: "past_due",
          });

          console.log("❌ Pago fallido, tenant actualizado:", tenant.id);
        } else {
          console.log("⚠️ Pago fallido pero no se encontró tenant:", {
            invoiceId: invoice.id,
            customer: invoice.customer,
            subscriptionId,
          });
        }

        break;
      }

      case "billing_portal.session.created":
        console.log("Portal de Stripe abierto correctamente");
        break;

      default:
        console.log("Evento no manejado:", event.type);
    }

    return res.json({ received: true });
  } catch (error) {
    console.log("❌ Error procesando webhook:", error);
    return res.status(500).send("Error");
  }
};