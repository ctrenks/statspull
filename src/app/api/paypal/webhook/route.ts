import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === "sandbox"
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error("Failed to get PayPal access token");
  }

  const data = await response.json();
  return data.access_token;
}

async function verifyWebhookSignature(
  request: NextRequest,
  body: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  
  if (!webhookId) {
    console.error("PAYPAL_WEBHOOK_ID not configured");
    return false;
  }

  try {
    const accessToken = await getPayPalAccessToken();

    const verifyPayload = {
      auth_algo: request.headers.get("paypal-auth-algo"),
      cert_url: request.headers.get("paypal-cert-url"),
      transmission_id: request.headers.get("paypal-transmission-id"),
      transmission_sig: request.headers.get("paypal-transmission-sig"),
      transmission_time: request.headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(body),
    };

    const response = await fetch(
      `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(verifyPayload),
      }
    );

    if (!response.ok) {
      console.error("Webhook verification failed:", await response.text());
      return false;
    }

    const result = await response.json();
    return result.verification_status === "SUCCESS";
  } catch (error) {
    console.error("Webhook verification error:", error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    
    // Verify webhook signature in production
    if (process.env.NODE_ENV === "production") {
      const isValid = await verifyWebhookSignature(request, body);
      if (!isValid) {
        console.error("Invalid webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event = JSON.parse(body);
    const eventType = event.event_type;
    const resource = event.resource;

    console.log(`PayPal webhook received: ${eventType}`);

    switch (eventType) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        // Initial subscription activation - already handled by activate-subscription API
        // This is a backup in case the client-side call fails
        const subscriptionId = resource.id;
        const planId = resource.plan_id;

        // Check if we already have a payment for this subscription
        const existingPayment = await prisma.payment.findFirst({
          where: { paypalSubscriptionId: subscriptionId },
        });

        if (!existingPayment) {
          // Subscription was activated but we don't have a record - this shouldn't happen
          // but log it for debugging
          console.log(`Subscription ${subscriptionId} activated but no payment record found`);
        } else {
          console.log(`Subscription ${subscriptionId} activated for user ${existingPayment.userId}`);
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.RE-ACTIVATED": {
        // Subscription re-activated from suspended state
        const subscriptionId = resource.id;
        const planId = resource.plan_id;

        const payment = await prisma.payment.findFirst({
          where: { paypalSubscriptionId: subscriptionId },
          include: { user: true },
        });

        if (payment) {
          // Determine months based on plan
          const isYearly = planId === process.env.PAYPAL_YEARLY_PLAN_ID;
          const months = isYearly ? 12 : 1;

          // Calculate new end date from now
          const newEndDate = new Date();
          newEndDate.setMonth(newEndDate.getMonth() + months);

          // Update user subscription
          await prisma.user.update({
            where: { id: payment.userId },
            data: {
              subscriptionStatus: "ACTIVE",
              subscriptionEndDate: newEndDate,
              role: 2,
            },
          });

          console.log(`Subscription ${subscriptionId} re-activated for user ${payment.userId}`);
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.EXPIRED": {
        // Subscription ended - mark as cancelled
        const subscriptionId = resource.id;

        const payment = await prisma.payment.findFirst({
          where: { paypalSubscriptionId: subscriptionId },
        });

        if (payment) {
          await prisma.user.update({
            where: { id: payment.userId },
            data: {
              subscriptionStatus: eventType === "BILLING.SUBSCRIPTION.EXPIRED" ? "EXPIRED" : "CANCELLED",
            },
          });

          console.log(`Subscription ${subscriptionId} ${eventType} for user ${payment.userId}`);
        }
        break;
      }

      case "PAYMENT.SALE.COMPLETED": {
        // Recurring payment completed - this is the key event for renewals
        const billingAgreementId = resource.billing_agreement_id;
        const amount = resource.amount?.total;
        const currency = resource.amount?.currency;
        
        if (billingAgreementId) {
          const payment = await prisma.payment.findFirst({
            where: { paypalSubscriptionId: billingAgreementId },
            include: { user: true },
            orderBy: { createdAt: "desc" },
          });

          if (payment) {
            // Determine if yearly or monthly based on amount
            const amountNum = parseFloat(amount || "0");
            const isYearly = amountNum > 100; // $275 yearly vs $25 monthly
            const months = isYearly ? 12 : 1;
            const priceInCents = Math.round(amountNum * 100);

            // Calculate new end date - extend from current end date or from now
            const currentEndDate = payment.user.subscriptionEndDate && payment.user.subscriptionEndDate > new Date()
              ? payment.user.subscriptionEndDate
              : new Date();
            const newEndDate = new Date(currentEndDate);
            newEndDate.setMonth(newEndDate.getMonth() + months);

            // Update user subscription
            await prisma.user.update({
              where: { id: payment.userId },
              data: {
                subscriptionStatus: "ACTIVE",
                subscriptionEndDate: newEndDate,
                role: 2,
              },
            });

            // Create new payment record for this renewal
            const newPayment = await prisma.payment.create({
              data: {
                userId: payment.userId,
                amount: priceInCents,
                currency: currency || "USD",
                type: isYearly ? "PAYPAL_YEARLY" : "PAYPAL_MONTHLY",
                months,
                status: "COMPLETED",
                paypalSubscriptionId: billingAgreementId,
                completedAt: new Date(),
                notes: `Recurring payment - PayPal Sale ID: ${resource.id}`,
              },
            });

            // Handle affiliate commission for renewal
            if (payment.user.referredById) {
              const affiliateSettings = await prisma.affiliateSettings.findFirst();
              const commissionRate = affiliateSettings?.tier1CommissionRate || 0.15;
              const commissionAmount = Math.floor(priceInCents * commissionRate);

              await prisma.commission.create({
                data: {
                  affiliateId: payment.user.referredById,
                  userId: payment.userId,
                  paymentId: newPayment.id,
                  amount: commissionAmount,
                  rate: commissionRate,
                  tier: 1,
                },
              });

              await prisma.user.update({
                where: { id: payment.user.referredById },
                data: {
                  affiliateBalance: { increment: commissionAmount },
                  totalEarnings: { increment: commissionAmount },
                },
              });
            }

            console.log(`Recurring payment $${amount} completed for subscription ${billingAgreementId}, user ${payment.userId}`);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
