import { useTranslation } from "react-i18next";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRuns } from "@/hooks/useRuns";
import { formatDateTime } from "@/lib/format";

export function RunsPage() {
  const { t, i18n } = useTranslation();
  const runs = useRuns();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("runs.title")}</CardTitle>
        <CardDescription>{t("runs.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {runs.isPending && <Skeleton className="h-40 w-full" />}
        {runs.isError && <p className="text-sm text-destructive">{t("common.loadError", { message: runs.error.message })}</p>}
        {runs.isSuccess && runs.data.length === 0 && <p className="text-sm text-muted-foreground">{t("runs.empty")}</p>}
        {runs.isSuccess && runs.data.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">{t("runs.started")}</TableHead>
                  <TableHead className="w-20">{t("runs.trigger")}</TableHead>
                  <TableHead className="w-24">{t("runs.status")}</TableHead>
                  <TableHead className="w-20 text-right">{t("runs.quota")}</TableHead>
                  <TableHead>{t("runs.result")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.data.map((run) => {
                  const changed = run.summary?.playlists.filter((p) => p.inserted + p.deleted + p.pending > 0 || p.created) ?? [];
                  return (
                    <TableRow key={run.id} className="align-top">
                      <TableCell className="whitespace-nowrap">{formatDateTime(run.startedAt, i18n.language)}</TableCell>
                      <TableCell>{run.trigger === "cron" ? t("runs.triggerCron") : t("runs.triggerManual")}</TableCell>
                      <TableCell>
                        <RunStatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{run.quotaUsed ?? "—"}</TableCell>
                      <TableCell className="space-y-1 text-sm">
                        {run.summary && <p className="text-muted-foreground">{t("runs.fetched", { count: run.summary.fetchedVideos })}</p>}
                        {run.summary?.subscriptions && (run.summary.subscriptions.added.length > 0 || run.summary.subscriptions.unsubscribed.length > 0) && (
                          <p className="text-muted-foreground">
                            {t("runs.subscriptions", {
                              added: run.summary.subscriptions.added.length,
                              unsubscribed: run.summary.subscriptions.unsubscribed.length,
                            })}
                          </p>
                        )}
                        {changed.map((playlist) => (
                          <p key={playlist.key}>
                            {t("runs.playlistChange", { title: playlist.title, inserted: playlist.inserted, deleted: playlist.deleted })}
                            {playlist.pending > 0 && <span className="text-muted-foreground">{t("runs.pending", { count: playlist.pending })}</span>}
                          </p>
                        ))}
                        {run.summary?.budgetExhausted && <p className="text-amber-800">{t("runs.budgetExhausted")}</p>}
                        {run.summary?.timeExhausted && <p className="text-amber-800">{t("runs.timeExhausted")}</p>}
                        {(run.summary?.notices ?? []).map((message, index) => (
                          <p key={`notice-${index}`} className="text-muted-foreground">
                            {message}
                          </p>
                        ))}
                        {[...(run.summary?.errors ?? []), ...(run.error ? [run.error] : [])].map((message, index) => (
                          <p key={index} className="text-destructive">
                            {message}
                          </p>
                        ))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
