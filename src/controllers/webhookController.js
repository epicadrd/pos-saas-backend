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

  if (!tenant) return;

  const periodEnd = await getPeriodEnd(subscription);
  
  await tenant.update({
    plan: subscription.metadata?.plan || tenant.plan,
    subscriptionStatus: subscription.status,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items?.data?.[0]?.price?.id || tenant.stripePriceId,
    subscriptionCurrentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    subscriptionCancelAt: subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000)
      : null,
  });
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
        }

        break;
      }

      default:
        console.log("Evento no manejado:", event.type);
    }

    return res.json({ received: true });
  } catch (error) {
    console.log("❌ Error procesando webhook:", error);
    return res.status(500).send("Error");
  }
};