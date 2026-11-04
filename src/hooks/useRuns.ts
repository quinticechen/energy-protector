import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { SyncSummary } from "@shared/syncJob.ts";
import { supabase } from "@/lib/supabase";

export type RunStatus = "running" | "success" | "partial" | "failed";

export interface SyncRun {
  id: number;
  trigger: "cron" | "manual";
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  quotaUsed: number | null;
  summary: SyncSummary | null;
  error: string | null;
}

const RUNS_KEY = ["sync-runs"] as const;

export function useRuns(limit = 30) {
  return useQuery({
    queryKey: [...RUNS_KEY, limit],
    // Poll while a run is in progress.
    refetchInterval: (query) => (query.state.data?.some((run) => run.status === "running") ? 5000 : false),
    queryFn: async (): Promise<SyncRun[]> => {
      const { data, error } = await supabase
        .from("sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        trigger: row.trigger as SyncRun["trigger"],
        status: row.status as RunStatus,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        quotaUsed: row.quota_used,
        summary: row.summary as unknown as SyncSummary | null,
        error: row.error,
      }));
    },
  });
}

/** Runs the daily-sync Edge Function now (the 立即更新 button). */
export function useRunSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SyncSummary> => {
      const { data, error } = await supabase.functions.invoke<SyncSummary>("daily-sync", { body: {} });
      if (error) {
        const body =
          error instanceof FunctionsHttpError
            ? ((await error.context.json().catch(() => ({}))) as { error?: string; message?: string })
            : {};
        throw new Error(body.message ?? body.error ?? error.message);
      }
      if (!data) throw new Error("empty response");
      return data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: RUNS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["preview-videos"] });
    },
  });
}
