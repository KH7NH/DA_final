import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import api from "../api/axios";
import { useAuth } from "@clerk/clerk-react";

import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const InnerForm = ({ onClose, onVerified }) => {
  const { getToken } = useAuth();
  const stripe = useStripe();
  const elements = useElements();

  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);

  // 1) create SetupIntent
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const token = await getToken();
        const { data } = await api.post(
          "/api/age/setup-intent",
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!data?.success) throw new Error(data?.message || "Failed to create SetupIntent");
        if (mounted) setClientSecret(data.client_secret);
      } catch (e) {
        toast.error(e?.response?.data?.message || e.message);
        onClose?.();
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getToken, onClose]);

  const handleVerify = async () => {
    if (!stripe || !elements) return;
    if (!clientSecret) return;

    setLoading(true);
    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card element not ready");

      // 2) confirm card setup (no charge)
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card },
      });

      if (result.error) {
        throw new Error(result.error.message || "Card verification failed");
      }

      const setupIntentId = result?.setupIntent?.id;
      if (!setupIntentId) throw new Error("Missing setupIntent id");

      // 3) tell server to mark user verified
      const token = await getToken();
      const { data } = await api.post(
        "/api/age/verify",
        { setup_intent_id: setupIntentId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!data?.success) throw new Error(data?.message || "Verify failed");

      toast.success("Verified successfully");
      onVerified?.();
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-900">Age verification</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-sm text-zinc-600 mt-2">
        This content is marked as sensitive. Verify that you have a valid card (no charge).
      </p>

      <div className="mt-4 border rounded-xl p-3">
        <CardElement
          options={{
            hidePostalCode: true,
            style: {
              base: { fontSize: "16px" },
            },
          }}
        />
      </div>

      <button
        onClick={handleVerify}
        disabled={!stripe || !clientSecret || loading}
        className="mt-4 w-full py-3 rounded-xl bg-black text-white text-sm font-semibold disabled:opacity-60"
      >
        {loading ? "Verifying..." : "Verify now"}
      </button>

      <button
        onClick={onClose}
        className="mt-2 w-full py-3 rounded-xl bg-zinc-100 text-zinc-900 text-sm font-semibold"
      >
        Cancel
      </button>
    </div>
  );
};

const AgeVerifyModal = ({ open, onClose, onVerified }) => {
  const options = useMemo(() => ({}), []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <Elements stripe={stripePromise} options={options}>
        <InnerForm onClose={onClose} onVerified={onVerified} />
      </Elements>
    </div>
  );
};

export default AgeVerifyModal;
