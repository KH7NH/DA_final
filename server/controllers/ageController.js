// server/controllers/ageController.js
import Stripe from "stripe";
import User from "../models/User.js";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY in server environment");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// Map Clerk -> Mongo user
const getCurrentUser = async (authFn) => {
  const auth = await authFn(); // IMPORTANT: req.auth() returns auth object
  const { userId } = auth;

  if (!userId) throw new Error("Unauthenticated");

  const user = await User.findOne({ clerkId: userId });
  if (!user) throw new Error("User not found");
  return user;
};

export const createSetupIntent = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);

    // 1) ensure stripe customer
    if (!user.stripe_customer_id) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { mongoUserId: String(user._id), clerkId: user.clerkId },
      });

      user.stripe_customer_id = customer.id;
      await user.save();
    }

    // 2) create setup intent (no charge)
    const si = await stripe.setupIntents.create({
      customer: user.stripe_customer_id,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        mongoUserId: String(user._id),
        clerkId: user.clerkId,
        purpose: "age_verification_A",
      },
    });

    return res.json({ success: true, client_secret: si.client_secret, setup_intent_id: si.id });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const verifySetupIntent = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);
    const { setup_intent_id } = req.body;

    if (!setup_intent_id) {
      return res.status(400).json({ success: false, message: "Missing setup_intent_id" });
    }

    const si = await stripe.setupIntents.retrieve(setup_intent_id);

    // Security: intent must belong to the same customer
    if (si.customer && user.stripe_customer_id && si.customer !== user.stripe_customer_id) {
      return res.status(403).json({ success: false, message: "SetupIntent does not belong to this user" });
    }

    if (si.status !== "succeeded") {
      return res
        .status(400)
        .json({ success: false, message: `SetupIntent not succeeded: ${si.status}` });
    }

    // Mark verified level A = 1
    user.age_verified_level = 1;
    user.age_verified_at = new Date();
    // optional: store last used payment method (not required)
    if (si.payment_method) user.age_verified_payment_method = String(si.payment_method);

    await user.save();

    return res.json({ success: true, level: 1 });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};
