import crypto from "crypto";

export function generateApiKey(): string {
  const prefix = "sf_live_";
  const randomBytes = crypto.randomBytes(32).toString("hex");
  return `${prefix}${randomBytes}`;
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 20) return "••••••••••••";
  return `${apiKey.slice(0, 12)}${"•".repeat(20)}${apiKey.slice(-8)}`;
}

export function validateApiKeyFormat(apiKey: string): boolean {
  return apiKey.startsWith("sf_live_") && apiKey.length === 72;
}
