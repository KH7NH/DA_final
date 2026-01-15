import React, { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import api from "../api/axios";
import { useAuth } from "@clerk/clerk-react";
import toast from "react-hot-toast";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

function VerifyAgeForm() {
  const stripe = useStripe();
  const elements = useElements();
  const { getToken } = useAuth();

  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const { data } = await api.post(
        "/api/age/setup-intent",
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!data.success) return toast.error(data.message);
      setClientSecret(data.client_secret);
    })();
  }, []);

  const submit = async () => {
    try {
      if (!stripe || !elements || !clientSecret) return;
      setLoading(true);

      const card = elements.getElement(CardElement);

      // confirmCardSetup flow :contentReference[oaicite:5]{index=5}
      const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card },
      });

      if (error) throw new Error(error.message);

      const token = await getToken();
      const { data } = await api.post(
        "/api/age/verify",
        { setup_intent_id: setupIntent.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!data.success) throw new Error(data.message);

      toast.success("Đã xác minh 18+ thành công!");
      // TODO: điều hướng về trang trước đó
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow space-y-4">
      <h2 className="text-lg font-semibold">Xác minh 18+</h2>
      <p className="text-sm text-gray-500">
        Bạn cần xác minh bằng thẻ để xem nội dung nhạy cảm (không trừ tiền).
      </p>

      <div className="border rounded p-3">
        <CardElement />
      </div>

      <button
        onClick={submit}
        disabled={!stripe || loading}
        className="w-full bg-indigo-600 text-white py-2 rounded"
      >
        {loading ? "Đang xác minh..." : "Xác minh"}
      </button>
    </div>
  );
}

export default function VerifyAge() {
  return (
    <Elements stripe={stripePromise}>
      <VerifyAgeForm />
    </Elements>
  );
}
