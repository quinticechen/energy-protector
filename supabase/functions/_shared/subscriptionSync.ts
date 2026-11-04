import type { Source } from "./types.ts";
import type { ChannelDetails, YouTubeApi } from "./youtubeClient.ts";

export interface NewSource {
  kind: Source["kind"];
  youtubeId: string;
  title: string;
  thumbnailUrl: string | null;
  topicSlug: string | null;
  enabled: boolean;
  origin: Source["origin"];
  subscribed: boolean;
}

export interface SourcePatch {
  id: string;
  subscribed?: boolean;
  enabled?: boolean;
  title?: string;
  thumbnailUrl?: string | null;
  topicSlug?: string | null;
}

export interface SubscriptionSyncSummary {
  /** Channel titles newly subscribed (added disabled). */
  added: string[];
  /** Channel titles no longer subscribed. */
  unsubscribed: string[];
  /** Of those, the ones that were enabled and got switched off. */
  disabled: string[];
  /** Titles subscribed again (left disabled until the admin enables them). */
  resubscribed: string[];
  /** Set when the sync was skipped for safety. */
  skipped: "empty_subscription_list" | null;
}

export interface SubscriptionPlan {
  inserts: NewSource[];
  patches: SourcePatch[];
  summary: SubscriptionSyncSummary;
}

/**
 * Compares the parents' current subscriptions with the stored channel sources.
 * - New subscription → new disabled source (the admin picks a topic and enables it).
 * - Unsubscribed → marked unsubscribed; subscription-origin channels are also disabled.
 *   Manually added channels are never disabled by this.
 * - An empty subscription list while sources are subscribed is treated as an API or
 *   account mistake: nothing changes.
 */
export function planSubscriptionSync(sources: Source[], subscriptions: ChannelDetails[]): SubscriptionPlan {
  const summary: SubscriptionSyncSummary = { added: [], unsubscribed: [], disabled: [], resubscribed: [], skipped: null };
  const channels = sources.filter((source) => source.kind === "channel");

  if (subscriptions.length === 0 && channels.some((source) => source.subscribed)) {
    return { inserts: [], patches: [], summary: { ...summary, skipped: "empty_subscription_list" } };
  }

  const current = new Map(subscriptions.map((channel) => [channel.id, channel]));
  const known = new Map(channels.map((source) => [source.youtubeId, source]));
  const inserts: NewSource[] = [];
  const patches: SourcePatch[] = [];

  for (const channel of subscriptions) {
    const source = known.get(channel.id);
    if (!source) {
      inserts.push({
        kind: "channel",
        youtubeId: channel.id,
        title: channel.title,
        thumbnailUrl: channel.thumbnailUrl,
        topicSlug: null,
        enabled: false,
        origin: "subscription",
        subscribed: true,
      });
      summary.added.push(channel.title);
      continue;
    }
    const patch: SourcePatch = { id: source.id };
    if (!source.subscribed) {
      patch.subscribed = true;
      summary.resubscribed.push(channel.title);
    }
    if (channel.title !== source.title) patch.title = channel.title;
    if (channel.thumbnailUrl && channel.thumbnailUrl !== source.thumbnailUrl) patch.thumbnailUrl = channel.thumbnailUrl;
    if (Object.keys(patch).length > 1) patches.push(patch);
  }

  for (const source of channels) {
    if (current.has(source.youtubeId) || !source.subscribed) continue;
    const patch: SourcePatch = { id: source.id, subscribed: false };
    summary.unsubscribed.push(source.title);
    if (source.origin === "subscription" && source.enabled) {
      patch.enabled = false;
      summary.disabled.push(source.title);
    }
    patches.push(patch);
  }

  return { inserts, patches, summary };
}

/** Database access the subscription sync needs. */
export interface SubscriptionStore {
  getAllSources(): Promise<Source[]>;
  upsertSources(sources: NewSource[], options?: { ignoreExisting?: boolean }): Promise<Source[]>;
  patchSources(patches: SourcePatch[]): Promise<void>;
}

export async function runSubscriptionSync(yt: YouTubeApi, store: SubscriptionStore): Promise<SubscriptionSyncSummary> {
  const [sources, subscriptions] = await Promise.all([store.getAllSources(), yt.listSubscriptions()]);
  const plan = planSubscriptionSync(sources, subscriptions);
  if (plan.inserts.length > 0) await store.upsertSources(plan.inserts, { ignoreExisting: true });
  if (plan.patches.length > 0) await store.patchSources(plan.patches);
  return plan.summary;
}
