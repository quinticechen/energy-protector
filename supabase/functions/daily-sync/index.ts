// Daily sync. Called by pg_cron (x-cron-secret header) or by the admin UI.
// Body { "only": "subscriptions" } syncs just the parents' subscriptions (cheap; not logged as a run).
import { adminEmail, corsHeaders, json, serveWithEnv, sendAlert, storeFor, youtubeFor } from "../_shared/edge.ts";
import { runSubscriptionSync, type SubscriptionSyncSummary } from "../_shared/subscriptionSync.ts";
import { runSync } from "../_shared/syncJob.ts";
import { YouTubeError } from "../_shared/youtubeClient.ts";

// Edge Functions are killed at 150 s; stop writing well before that so the run is recorded.
const TIME_BUDGET_MS = 110_000;
const STALE_RUN_MS = 10 * 60_000;
const RELINK_HINT = "在電腦上執行 `npm run ep link`，再更新 YOUTUBE_REFRESH_TOKEN。";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

serveWithEnv(async (req, env) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(env) });
  if (req.method !== "POST") return json(env, 405, { error: "method_not_allowed" });

  const store = storeFor(env);
  const isCron = req.headers.get("x-cron-secret") === env.cronSecret;
  if (!isCron && !(await adminEmail(req, env, store))) return json(env, 401, { error: "unauthorized" });

  const body = (await req.json().catch(() => ({}))) as { only?: unknown };
  if (body.only === "subscriptions") {
    try {
      const subscriptions = await runSubscriptionSync(await youtubeFor(env), store);
      return json(env, 200, { subscriptions });
    } catch (error) {
      return json(env, 500, { error: describe(error) });
    }
  }

  await store.failStaleRuns(new Date(Date.now() - STALE_RUN_MS));
  const runId = await store.startRun(isCron ? "cron" : "manual");
  try {
    const yt = await youtubeFor(env);
    // Subscriptions first, so unsubscribed channels are already disabled for this run.
    let subscriptions: SubscriptionSyncSummary | null = null;
    let subscriptionError: string | null = null;
    try {
      subscriptions = await runSubscriptionSync(yt, store);
    } catch (error) {
      subscriptionError = `同步訂閱失敗：${describe(error)}`;
    }
    const summary = await runSync({
      yt,
      store,
      now: new Date(),
      timeZone: env.timeZone,
      quotaBudget: env.quotaBudget,
      timeBudgetMs: TIME_BUDGET_MS,
    });
    summary.subscriptions = subscriptions;
    if (subscriptionError) summary.errors.unshift(subscriptionError);
    await store.finishRun(runId, { summary });
    if (summary.errors.length > 0) {
      await sendAlert(env, `Energy Protector：更新時有 ${summary.errors.length} 個問題`, summary.errors);
    }
    return json(env, 200, { runId, ...summary });
  } catch (error) {
    const message = describe(error);
    await store.finishRun(runId, { error: message });
    const relink = error instanceof YouTubeError && error.reason === "invalid_grant";
    await sendAlert(env, relink ? "Energy Protector：YouTube 授權失效，請重新連結" : "Energy Protector：每日更新失敗", [
      message,
      ...(relink ? ["", RELINK_HINT] : []),
    ]);
    return json(env, 500, { runId, error: message });
  }
});
