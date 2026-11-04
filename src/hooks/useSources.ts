import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { SubscriptionSyncSummary } from "@shared/subscriptionSync.ts";
import type { Source, Topic } from "@shared/types.ts";
import { supabase } from "@/lib/supabase";

const SOURCES_KEY = ["sources"] as const;

export function useTopics() {
  return useQuery({
    queryKey: ["topics"],
    staleTime: Infinity,
    queryFn: async (): Promise<Topic[]> => {
      const { data, error } = await supabase.from("topics").select("slug, name, sort").order("sort");
      if (error) throw error;
      return data;
    },
  });
}

export function useSources() {
  return useQuery({
    queryKey: SOURCES_KEY,
    queryFn: async (): Promise<Source[]> => {
      const { data, error } = await supabase.from("sources").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        kind: row.kind as Source["kind"],
        youtubeId: row.youtube_id,
        title: row.title,
        thumbnailUrl: row.thumbnail_url,
        topicSlug: row.topic_slug,
        enabled: row.enabled,
        origin: row.origin as Source["origin"],
        subscribed: row.subscribed,
      }));
    },
  });
}

export interface SourceUpdate {
  id: string;
  topicSlug?: string | null;
  enabled?: boolean;
}

export function useUpdateSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, topicSlug, enabled }: SourceUpdate) => {
      const { error } = await supabase
        .from("sources")
        .update({
          ...(topicSlug === undefined ? {} : { topic_slug: topicSlug }),
          ...(enabled === undefined ? {} : { enabled }),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}

export function useDeleteSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
      void queryClient.invalidateQueries({ queryKey: ["preview-videos"] });
    },
  });
}

/** Error codes returned by the add-source Edge Function. */
export type AddSourceErrorCode = "invalid_url" | "not_found" | "topic_required" | "unauthorized" | "generic";

export class AddSourceError extends Error {
  readonly code: AddSourceErrorCode;
  constructor(code: AddSourceErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function useAddSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { url: string; topicSlug: string | null }): Promise<Source> => {
      const { data, error } = await supabase.functions.invoke<{ source: Source }>("add-source", { body: input });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = (await error.context.json().catch(() => ({}))) as { error?: string; message?: string };
          const known: AddSourceErrorCode[] = ["invalid_url", "not_found", "topic_required", "unauthorized"];
          const code = known.find((item) => item === body.error) ?? "generic";
          throw new AddSourceError(code, body.message ?? body.error ?? error.message);
        }
        throw new AddSourceError("generic", error.message);
      }
      if (!data) throw new AddSourceError("generic", "empty response");
      return data.source;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}

/** Pulls the parents' current YouTube subscriptions into the source list. */
export function useSyncSubscriptions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SubscriptionSyncSummary> => {
      const { data, error } = await supabase.functions.invoke<{ subscriptions: SubscriptionSyncSummary }>("daily-sync", {
        body: { only: "subscriptions" },
      });
      if (error) {
        const body =
          error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => ({}))) as { error?: string }) : {};
        throw new Error(body.error ?? error.message);
      }
      if (!data) throw new Error("empty response");
      return data.subscriptions;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}
