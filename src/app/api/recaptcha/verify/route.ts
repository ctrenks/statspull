import { NextRequest, NextResponse } from "next/server";

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { token, action } = await request.json();

    if (!token) {
      return NextResponse.json(
        { success: false, error: "No reCAPTCHA token provided" },
        { status: 400 }
      );
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    if (!secretKey) {
      console.warn("reCAPTCHA secret key not configured, allowing request");
      return NextResponse.json({ success: true, score: 1.0 });
    }

    // Verify with Google
    const response = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: secretKey,
          response: token,
        }),
      }
    );

    const data: RecaptchaResponse = await response.json();

    if (!data.success) {
      console.error("reCAPTCHA verification failed:", data["error-codes"]);
      return NextResponse.json(
        { success: false, error: "reCAPTCHA verification failed" },
        { status: 400 }
      );
    }

    // Check action matches (prevents token reuse across different forms)
    if (action && data.action !== action) {
      console.error("reCAPTCHA action mismatch:", data.action, "expected:", action);
      return NextResponse.json(
        { success: false, error: "reCAPTCHA action mismatch" },
        { status: 400 }
      );
    }

    // Score threshold (0.0 = likely bot, 1.0 = likely human)
    // 0.5 is Google's recommended threshold
    const threshold = 0.5;
    if (data.score !== undefined && data.score < threshold) {
      console.warn("reCAPTCHA score too low:", data.score);
      return NextResponse.json(
        { success: false, error: "Request blocked by reCAPTCHA", score: data.score },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      score: data.score,
    });
  } catch (error) {
    console.error("reCAPTCHA verification error:", error);
    return NextResponse.json(
      { success: false, error: "reCAPTCHA verification error" },
      { status: 500 }
    );
  }
}
