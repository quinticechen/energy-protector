// Energy Protector admin CLI (one-time setup tasks).
// Usage: node --experimental-strip-types cli/ep.ts <link|import-subs|add-admin <email>|sync>
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createRestStore } from "../supabase/functions/_shared/restStore.ts";
import { runSubscriptionSync } from "../supabase/functions/_shared/subscriptionSync.ts";
import { runSync } from "../supabase/functions/_shared/syncJob.ts";
import { createYouTubeClient, refreshAccessToken } from "../supabase/functions/_shared/youtubeClient.ts";
import { loadEnvFiles, saveEnvValue } from "./envFile.ts";

const LOOPBACK_PORT = 53682;
const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube";

loadEnvFiles();

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Add it to .env or .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

function store() {
  return createRestStore({ url: env("SUPABASE_URL"), serviceKey: env("SUPABASE_SERVICE_ROLE_KEY") });
}

async function youtube() {
  const accessToken = await refreshAccessToken({
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    refreshToken: env("YOUTUBE_REFRESH_TOKEN"),
  });
  return createYouTubeClient({ accessToken });
}

/** OAuth loopback flow with PKCE. Sign in as the parents' YouTube account. */
async function link(): Promise<void> {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  const redirectUri = `http://127.0.0.1:${LOOPBACK_PORT}/callback`;
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const received = url.searchParams.get("code");
      const ok = !error && received && url.searchParams.get("state") === state;
      res.writeHead(ok ? 200 : 400, { "content-type": "text/plain; charset=utf-8" });
      res.end(ok ? "授權完成，可以關閉這個分頁。" : `授權失敗：${error ?? "state mismatch"}`);
      server.close();
      if (ok) resolve(received);
      else reject(new Error(error ?? "OAuth state mismatch"));
    });
    server.listen(LOOPBACK_PORT, "127.0.0.1", () => {
      console.log("Open this link and sign in with your parents' YouTube account (pick the right channel/brand account):\n");
      console.log(authUrl.toString(), "\n");
    });
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const tokens = (await response.json()) as { refresh_token?: string; access_token?: string; error?: string };
  if (!tokens.refresh_token || !tokens.access_token) throw new Error(`Token exchange failed: ${tokens.error ?? "no refresh token"}`);

  const me = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  }).then((res) => res.json() as Promise<{ items?: { snippet: { title: string } }[] }>);

  console.log(`Linked YouTube channel: ${me.items?.[0]?.snippet.title ?? "(no channel on this account)"}`);
  // The token is written to the env file, never printed, so it stays out of logs and chats.
  const file = saveEnvValue("YOUTUBE_REFRESH_TOKEN", tokens.refresh_token);
  console.log(`Saved YOUTUBE_REFRESH_TOKEN to ${file}. Next: copy it to the Edge Function secrets (see docs/setup.md).`);
}

/** Syncs the parents' subscriptions: new ones arrive disabled; the admin enables them in the UI (來源). */
async function importSubscriptions(): Promise<void> {
  const summary = await runSubscriptionSync(await youtube(), store());
  if (summary.skipped) {
    console.log("YouTube returned no subscriptions; nothing changed (check the linked account).");
    return;
  }
  console.log(`Added ${summary.added.length}, unsubscribed ${summary.unsubscribed.length} (disabled ${summary.disabled.length}), resubscribed ${summary.resubscribed.length}.`);
  for (const [label, titles] of Object.entries({ added: summary.added, unsubscribed: summary.unsubscribed, resubscribed: summary.resubscribed })) {
    if (titles.length > 0) console.log(`  ${label}: ${titles.join("、")}`);
  }
}

/** Shows which YouTube account is linked and what YouTube reports for it right now. */
async function whoami(): Promise<void> {
  const accessToken = await refreshAccessToken({
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    refreshToken: env("YOUTUBE_REFRESH_TOKEN"),
  });
  const me = (await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { authorization: `Bearer ${accessToken}` },
  }).then((res) => res.json())) as { items?: { id: string; snippet: { title: string } }[] };
  const channel = me.items?.[0];
  console.log(`Linked account channel: ${channel ? `${channel.snippet.title} (${channel.id})` : "(no channel)"}`);
  const subscriptions = await createYouTubeClient({ accessToken }).listSubscriptions();
  console.log(`YouTube reports ${subscriptions.length} subscriptions:`);
  console.log(subscriptions.map((item) => `  ${item.title}`).sort().join("\n"));
}

/** Lists the managed playlists on the parents' account with their current video count. */
async function playlists(): Promise<void> {
  const yt = await youtube();
  for (const playlist of await store().getManagedPlaylists()) {
    const items = await yt.listPlaylistItems(playlist.youtubePlaylistId, 5000).catch(() => null);
    console.log(`${playlist.title.padEnd(12, "　")} ${items === null ? "missing on YouTube" : `${items.length} videos`}`);
  }
}

async function addAdmin(email: string | undefined): Promise<void> {
  if (!email?.includes("@")) {
    console.error("Usage: ep add-admin <email>");
    process.exit(1);
  }
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/admins?on_conflict=email`, {
    method: "POST",
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "content-type": "application/json",
      prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({ email: email.toLowerCase() }),
  });
  if (!response.ok) throw new Error(`Failed (${response.status}): ${await response.text()}`);
  console.log(`${email} can now sign in to the admin UI.`);
}

/** Runs the daily sync from this machine (same code as the Edge Function). */
async function sync(): Promise<void> {
  const summary = await runSync({
    yt: await youtube(),
    store: store(),
    now: new Date(),
    timeZone: process.env.FAMILY_TIME_ZONE ?? "Asia/Taipei",
    quotaBudget: Number(process.env.QUOTA_BUDGET ?? 8000),
  });
  console.log(JSON.stringify(summary, null, 2));
}

const [command, ...args] = process.argv.slice(2);
const commands: Record<string, () => Promise<void>> = {
  link,
  "import-subs": importSubscriptions,
  "add-admin": () => addAdmin(args[0]),
  whoami,
  playlists,
  sync,
};

const run = command ? commands[command] : undefined;
if (!run) {
  console.log("Commands: link | import-subs | whoami | playlists | add-admin <email> | sync");
  process.exit(command ? 1 : 0);
}
run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
