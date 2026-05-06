import { stripe } from "../config/stripe.js";
import { Tenant } from "../models/index.js";

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

  console.log("📦 Evento Stripe:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        const customerId = session.customer;
        const subscriptionId = session.subscription;

        const tenant = await Tenant.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (tenant) {
          await tenant.update({
            subscriptionStatus: "active",
            stripeSubscriptionId: subscriptionId,
          });

          console.log("✅ Suscripción activada");
        }

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
          });

          console.log("❌ Suscripción cancelada");
        }

        break;
      }

      default:
        console.log("ℹ️ Evento no manejado:", event.type);
    }

    res.json({ received: true });
  } catch (error) {
    console.log("❌ Error procesando webhook:", error);
    res.status(500).send("Error");
  }
};