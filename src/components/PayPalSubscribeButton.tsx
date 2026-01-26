"use client";

import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { useState } from "react";

interface PayPalSubscribeButtonProps {
  planId: string;
  planType: "monthly" | "yearly";
  onSuccess?: (subscriptionId: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export function PayPalSubscribeButton({
  planId,
  planType,
  onSuccess,
  onError,
  disabled = false,
}: PayPalSubscribeButtonProps) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer();
  const [processing, setProcessing] = useState(false);

  if (isPending) {
    return (
      <div className="h-12 bg-dark-700 rounded-lg animate-pulse flex items-center justify-center">
        <span className="text-dark-400 text-sm">Loading PayPal...</span>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="h-12 bg-red-900/20 border border-red-500/30 rounded-lg flex items-center justify-center">
        <span className="text-red-400 text-sm">PayPal failed to load</span>
      </div>
    );
  }

  return (
    <div className={disabled || processing ? "opacity-50 pointer-events-none" : ""}>
      <PayPalButtons
        style={{
          shape: "rect",
          color: "blue",
          layout: "horizontal",
          label: "subscribe",
          tagline: false,
        }}
        disabled={disabled || processing}
        createSubscription={(data, actions) => {
          return actions.subscription.create({
            plan_id: planId,
          });
        }}
        onApprove={async (data) => {
          setProcessing(true);
          try {
            // Call our API to activate the subscription
            const response = await fetch("/api/paypal/activate-subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                subscriptionId: data.subscriptionID,
                planType,
              }),
            });

            const result = await response.json();

            if (response.ok) {
              onSuccess?.(data.subscriptionID || "");
            } else {
              onError?.(result.error || "Failed to activate subscription");
            }
          } catch (error) {
            console.error("Subscription activation error:", error);
            onError?.("Failed to activate subscription");
          } finally {
            setProcessing(false);
          }
        }}
        onError={(err) => {
          console.error("PayPal error:", err);
          onError?.("PayPal encountered an error");
        }}
        onCancel={() => {
          // User cancelled - no action needed
        }}
      />
    </div>
  );
}
