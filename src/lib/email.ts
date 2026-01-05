import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendWelcomeEmail(email: string, name: string) {
  const resend = getResend();
  try {
    await resend.emails.send({
      from: "Stats Fetch <noreply@statsfetch.com>",
      to: email,
      subject: "Welcome to Stats Fetch!",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f1f5f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; padding: 40px; border: 1px solid #334155;">
              <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="color: #22c55e; font-size: 28px; margin: 0;">Stats Fetch</h1>
                <p style="color: #94a3b8; margin-top: 8px;">Powerful Stats Fetching API</p>
              </div>

              <h2 style="color: #f1f5f9; font-size: 24px; margin-bottom: 16px;">Welcome, ${name || "there"}!</h2>

              <p style="color: #cbd5e1; line-height: 1.6; margin-bottom: 24px;">
                Thank you for signing up for Stats Fetch. Your account has been created successfully.
              </p>

              <p style="color: #cbd5e1; line-height: 1.6; margin-bottom: 24px;">
                You can now generate your API key from the dashboard and start using our powerful stats fetching tools.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="https://statsfetch.com/dashboard" style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">Go to Dashboard</a>
              </div>

              <hr style="border: none; border-top: 1px solid #334155; margin: 32px 0;">

              <p style="color: #64748b; font-size: 14px; text-align: center;">
                If you didn't create this account, please ignore this email.
              </p>
            </div>
          </body>
        </html>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    return { success: false, error };
  }
}

export async function sendApiKeyEmail(email: string, apiKey: string) {
  const resend = getResend();
  try {
    await resend.emails.send({
      from: "Stats Fetch <noreply@statsfetch.com>",
      to: email,
      subject: "Your New API Key - Stats Fetch",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f1f5f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; padding: 40px; border: 1px solid #334155;">
              <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="color: #22c55e; font-size: 28px; margin: 0;">Stats Fetch</h1>
                <p style="color: #94a3b8; margin-top: 8px;">Powerful Stats Fetching API</p>
              </div>

              <h2 style="color: #f1f5f9; font-size: 24px; margin-bottom: 16px;">Your New API Key</h2>

              <p style="color: #cbd5e1; line-height: 1.6; margin-bottom: 24px;">
                A new API key has been generated for your account. Please save it securely - you won't be able to see it again.
              </p>

              <div style="background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <code style="color: #22c55e; font-family: 'JetBrains Mono', monospace; font-size: 14px; word-break: break-all;">${apiKey}</code>
              </div>

              <p style="color: #f59e0b; font-size: 14px; margin-bottom: 24px;">
                ⚠️ Keep this key secret. Do not share it publicly or commit it to version control.
              </p>

              <hr style="border: none; border-top: 1px solid #334155; margin: 32px 0;">

              <p style="color: #64748b; font-size: 14px; text-align: center;">
                If you didn't request a new API key, please secure your account immediately.
              </p>
            </div>
          </body>
        </html>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send API key email:", error);
    return { success: false, error };
  }
}
