import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "You must be logged in to request payment" }, { status: 401 });
  }

  try {
    const { months, price, paymentMethod, message } = await request.json();

    if (!months || !price) {
      return NextResponse.json({ error: "Months and price are required" }, { status: 400 });
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, username: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Create a pending payment record
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        amount: price * 100, // Convert to cents
        type: "CRYPTO",
        months: months,
        status: "PENDING",
        notes: `Payment method: ${paymentMethod || "Crypto"}\nUser message: ${message || "None"}`,
      },
    });

    // Send email to admin
    const adminEmail = process.env.ADMIN_EMAIL || "support@statsfetch.com";
    const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev";

    await resend.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `[Stats Fetch] Payment Request - ${months} month(s) - $${price}`,
      html: `
        <h2>New Payment Request</h2>
        <p><strong>User:</strong> ${user.username || user.email}</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Plan:</strong> ${months} month(s)</p>
        <p><strong>Amount:</strong> $${price}</p>
        <p><strong>Payment Method:</strong> ${paymentMethod || "Crypto"}</p>
        <p><strong>Message:</strong> ${message || "None"}</p>
        <p><strong>Payment ID:</strong> ${payment.id}</p>
        <hr />
        <p>Log in to the admin panel to process this payment:</p>
        <p><a href="https://www.statsfetch.com/admin/payments">Admin Payments Panel</a></p>
      `,
    });

    // Also send confirmation to the user
    await resend.emails.send({
      from: fromEmail,
      to: user.email,
      subject: `Payment Request Received - Stats Fetch`,
      html: `
        <h2>Payment Request Received</h2>
        <p>Hi ${user.username || "there"},</p>
        <p>We've received your payment request for <strong>${months} month(s)</strong> of Stats Fetch subscription.</p>
        <p><strong>Amount:</strong> $${price}</p>
        <p><strong>Payment Method:</strong> ${paymentMethod || "Crypto"}</p>
        <hr />
        <h3>Next Steps:</h3>
        <p>Please send your payment to one of the following addresses:</p>
        <ul>
          <li><strong>Bitcoin (BTC):</strong> Contact support for address</li>
          <li><strong>Ethereum (ETH):</strong> Contact support for address</li>
          <li><strong>USDT (TRC20):</strong> Contact support for address</li>
        </ul>
        <p>Reply to this email with your transaction ID/hash once payment is sent, and we'll activate your subscription within 24 hours.</p>
        <hr />
        <p>Thanks for choosing Stats Fetch!</p>
      `,
    });

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      message: "Payment request sent! Check your email for next steps.",
    });
  } catch (error) {
    console.error("Error sending payment request:", error);
    return NextResponse.json({ error: "Failed to send payment request" }, { status: 500 });
  }
}
