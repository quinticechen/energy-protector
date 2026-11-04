import { test } from "node:test";
import assert from "node:assert/strict";
import { planSubscriptionSync, runSubscriptionSync } from "../supabase/functions/_shared/subscriptionSync.ts";
import type { Source } from "../supabase/functions/_shared/types.ts";
import { FakeStore, FakeYouTube } from "./fakes.ts";

function source(overrides: Partial<Source> & { id: string; youtubeId: string }): Source {
  return {
    kind: "channel",
    title: overrides.youtubeId,
    thumbnailUrl: null,
    topicSlug: "health",
    enabled: true,
    origin: "subscription",
    subscribed: true,
    ...overrides,
  };
}

const sub = (id: string, title = id) => ({ id, title, thumbnailUrl: null });

test("new subscriptions are added disabled, without a topic", () => {
  const plan = planSubscriptionSync([source({ id: "1", youtubeId: "UCa" })], [sub("UCa"), sub("UCnew", "新頻道")]);
  assert.deepEqual(plan.inserts, [
    { kind: "channel", youtubeId: "UCnew", title: "新頻道", thumbnailUrl: null, topicSlug: null, enabled: false, origin: "subscription", subscribed: true },
  ]);
  assert.deepEqual(plan.summary.added, ["新頻道"]);
  assert.deepEqual(plan.patches, []);
});

test("unsubscribing disables imported channels but never manual ones", () => {
  const plan = planSubscriptionSync(
    [
      source({ id: "1", youtubeId: "UCimported", title: "AI 劇場" }),
      source({ id: "2", youtubeId: "UCmanual", title: "公視", origin: "manual" }),
      source({ id: "3", youtubeId: "UCoff", title: "已關閉", enabled: false }),
      source({ id: "4", youtubeId: "UCkeep" }),
    ],
    [sub("UCkeep")],
  );
  assert.deepEqual(plan.patches, [
    { id: "1", subscribed: false, enabled: false },
    { id: "2", subscribed: false },
    { id: "3", subscribed: false },
  ]);
  assert.deepEqual(plan.summary.unsubscribed, ["AI 劇場", "公視", "已關閉"]);
  assert.deepEqual(plan.summary.disabled, ["AI 劇場"]);
});

test("resubscribing marks the channel subscribed but leaves it disabled", () => {
  const plan = planSubscriptionSync([source({ id: "1", youtubeId: "UCa", subscribed: false, enabled: false })], [sub("UCa")]);
  assert.deepEqual(plan.patches, [{ id: "1", subscribed: true }]);
  assert.deepEqual(plan.summary.resubscribed, ["UCa"]);
});

test("renamed channels get their new title; unchanged ones are not patched", () => {
  const plan = planSubscriptionSync([source({ id: "1", youtubeId: "UCa", title: "舊名" }), source({ id: "2", youtubeId: "UCb" })], [sub("UCa", "新名"), sub("UCb")]);
  assert.deepEqual(plan.patches, [{ id: "1", title: "新名" }]);
});

test("an empty subscription list changes nothing", () => {
  const plan = planSubscriptionSync([source({ id: "1", youtubeId: "UCa" })], []);
  assert.equal(plan.summary.skipped, "empty_subscription_list");
  assert.deepEqual(plan.patches, []);
  assert.equal(planSubscriptionSync([], []).summary.skipped, null);
});

test("series playlists are ignored by the subscription sync", () => {
  const plan = planSubscriptionSync([source({ id: "1", youtubeId: "PLshow", kind: "playlist", origin: "manual", subscribed: false })], [sub("UCa")]);
  assert.equal(plan.inserts.length, 1);
  assert.deepEqual(plan.patches, []);
});

test("runSubscriptionSync applies the plan to the store", async () => {
  const yt = new FakeYouTube();
  yt.channels.set("UCkeep", { id: "UCkeep", title: "保留", thumbnailUrl: null });
  yt.channels.set("UCnew", { id: "UCnew", title: "新的", thumbnailUrl: null });
  const store = new FakeStore();
  store.sources = [source({ id: "1", youtubeId: "UCkeep" }), source({ id: "2", youtubeId: "UCgone", title: "取消的" })];

  const summary = await runSubscriptionSync(yt, store);
  assert.deepEqual(summary.added, ["新的"]);
  assert.deepEqual(summary.disabled, ["取消的"]);
  assert.deepEqual(
    store.sources.map(({ youtubeId, enabled, subscribed }) => ({ youtubeId, enabled, subscribed })),
    [
      { youtubeId: "UCkeep", enabled: true, subscribed: true },
      { youtubeId: "UCgone", enabled: false, subscribed: false },
      { youtubeId: "UCnew", enabled: false, subscribed: true },
    ],
  );
  // Running again changes nothing.
  const again = await runSubscriptionSync(yt, store);
  assert.deepEqual([again.added, again.unsubscribed, again.resubscribed], [[], [], []]);
});
