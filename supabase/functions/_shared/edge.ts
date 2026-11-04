// Helpers shared by the Edge Functions (Deno runtime).
import { createRestStore, type RestStore } from "./restStore.ts";
import { createYouTubeClient, refreshAccessToken, type YouTubeApi } from "./youtubeClient.ts";

export interface EdgeEnv {
  supabaseUrl: string;
  serviceKey: string;
  anonKey: string;
  googleClientId: string;
  googleClientSecret: string;
  youtubeRefreshToken: string;
  cronSecret: string;
  resendApiKey: string | null;
  alertEmail: string | null;
  alertFrom: string;
  timeZone: string;
  quotaBudget: number;
  allowedOrigin: string;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
}

export function loadEnv(): EdgeEnv {
  return {
    supabaseUrl: required("SUPABASE_URL"),
    serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    anonKey: required("SUPABASE_ANON_KEY"),
    googleClientId: required("GOOGLE_CLIENT_ID"),
    googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
    youtubeRefreshToken: required("YOUTUBE_REFRESH_TOKEN"),
    cronSecret: required("CRON_SECRET"),
    resendApiKey: Deno.env.get("RESEND_API_KEY") ?? null,
    alertEmail: Deno.env.get("ALERT_EMAIL") ?? null,
    alertFrom: Deno.env.get("ALERT_FROM") ?? "Energy Protector <onboarding@resend.dev>",
    timeZone: Deno.env.get("FAMILY_TIME_ZONE") ?? "Asia/Taipei",
    quotaBudget: Number(Deno.env.get("QUOTA_BUDGET") ?? 8000),
    allowedOrigin: Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  };
}

/** Wraps a handler so a missing secret returns a clear JSON error instead of a bare 500. */
export function serveWithEnv(handler: (req: Request, env: EdgeEnv) => Promise<Response>): void {
  Deno.serve(async (req: Request) => {
    let env: EdgeEnv;
    try {
      env = loadEnv();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      return json({ allowedOrigin: "*" }, 500, { error: "misconfigured", message });
    }
    return handler(req, env);
  });
}

export function storeFor(env: EdgeEnv): RestStore {
  return createRestStore({ url: env.supabaseUrl, serviceKey: env.serviceKey });
}

export async function youtubeFor(env: EdgeEnv): Promise<YouTubeApi> {
  const accessToken = await refreshAccessToken({
    clientId: env.googleClientId,
    clientSecret: env.googleClientSecret,
    refreshToken: env.youtubeRefreshToken,
  });
  return createYouTubeClient({ accessToken });
}

export function corsHeaders(env: Pick<EdgeEnv, "allowedOrigin">): Record<string, string> {
  return {
    "access-control-allow-origin": env.allowedOrigin,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

export function json(env: Pick<EdgeEnv, "allowedOrigin">, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(env) },
  });
}

/** Returns the signed-in user's email if they are in the admins table. */
export async function adminEmail(req: Request, env: EdgeEnv, store: RestStore): Promise<string | null> {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: env.anonKey, authorization },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as { email?: string };
  if (!user.email) return null;
  return (await store.isAdmin(user.email)) ? user.email : null;
}

/** Sends a failure email through Resend. Never throws: alerts must not mask the real error. */
export async function sendAlert(env: EdgeEnv, subject: string, lines: string[]): Promise<void> {
  if (!env.resendApiKey || !env.alertEmail) {
    console.warn("Alert email not configured:", subject, lines);
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.alertFrom, to: [env.alertEmail], subject, text: lines.join("\n") }),
    });
    if (!response.ok) console.error("Resend failed", response.status, await response.text());
  } catch (error) {
    console.error("Resend failed", error);
  }
}
