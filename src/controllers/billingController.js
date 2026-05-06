import { stripe } from "../config/stripe.js";
import { Tenant } from "../models/index.js";

export const createCheckoutSession = async (req, res) => {
  try {
    const { tenantId } = req.body;

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    let customerId = tenant.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.businessName,
      });

      customerId = customer.id;

      await tenant.update({
        stripeCustomerId: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],

      line_items: [
        {
          price: process.env.STRIPE_PRICE_STARTER,
          quantity: 1,
        },
      ],

      success_url: `${process.env.APP_URL}/success`,
      cancel_url: `${process.env.APP_URL}/cancel`,
    });

    return res.json({
      url: session.url,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Error creando sesión de pago",
    });
  }
};