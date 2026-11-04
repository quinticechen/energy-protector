// Adds a whitelist source from a pasted YouTube link. Admins only.
import { adminEmail, corsHeaders, json, serveWithEnv, storeFor, youtubeFor } from "../_shared/edge.ts";
import { resolveSource } from "../_shared/resolveSource.ts";

interface AddSourceBody {
  url?: unknown;
  topicSlug?: unknown;
}

serveWithEnv(async (req, env) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(env) });
  if (req.method !== "POST") return json(env, 405, { error: "method_not_allowed" });

  const store = storeFor(env);
  if (!(await adminEmail(req, env, store))) return json(env, 401, { error: "unauthorized" });

  const body = (await req.json().catch(() => ({}))) as AddSourceBody;
  if (typeof body.url !== "string") return json(env, 400, { error: "invalid_url" });
  const topicSlug = typeof body.topicSlug === "string" && body.topicSlug ? body.topicSlug : null;

  try {
    const resolved = await resolveSource(await youtubeFor(env), body.url);
    if (!resolved.ok) return json(env, resolved.error === "invalid_url" ? 400 : 404, { error: resolved.error });

    const isChannel = resolved.source.kind === "channel";
    if (isChannel && !topicSlug) return json(env, 400, { error: "topic_required", source: resolved.source });

    const topic = isChannel ? topicSlug : null;
    // An existing source (e.g. an imported subscription) keeps its origin and subscription status.
    const existing = (await store.getAllSources()).find((item) => item.youtubeId === resolved.source.youtubeId);
    let source;
    if (existing) {
      await store.patchSources([{ id: existing.id, topicSlug: topic, enabled: true }]);
      source = { ...existing, topicSlug: topic, enabled: true };
    } else {
      [source] = await store.upsertSources([
        { ...resolved.source, topicSlug: topic, enabled: true, origin: "manual", subscribed: false },
      ]);
    }
    return json(env, 200, { source });
  } catch (error) {
    return json(env, 500, { error: "server_error", message: error instanceof Error ? error.message : String(error) });
  }
});
