import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AddSourceForm } from "@/components/AddSourceForm";
import { SourceRow } from "@/components/SourceRow";
import { SubscriptionSyncStatus } from "@/components/SubscriptionSyncStatus";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSources } from "@/hooks/useSources";

type SourceTab = "all" | "enabled" | "disabled";

export function SourcesPage() {
  const { t } = useTranslation();
  const sources = useSources();
  const [tab, setTab] = useState<SourceTab>("all");

  const all = sources.data ?? [];
  const enabled = all.filter((source) => source.enabled);
  const disabled = all.filter((source) => !source.enabled);
  const shown = tab === "enabled" ? enabled : tab === "disabled" ? disabled : all;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("sources.addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AddSourceForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="space-y-1.5">
            <CardTitle>{t("sources.title")}</CardTitle>
            <CardDescription>{t("sources.description")}</CardDescription>
          </div>
          <SubscriptionSyncStatus />
          <Tabs value={tab} onValueChange={(value) => setTab(value as SourceTab)}>
            <TabsList>
              <TabsTrigger value="all">{t("sources.tabAll", { count: all.length })}</TabsTrigger>
              <TabsTrigger value="enabled">{t("sources.tabEnabled", { count: enabled.length })}</TabsTrigger>
              <TabsTrigger value="disabled">{t("sources.tabDisabled", { count: disabled.length })}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {sources.isPending && <Skeleton className="h-40 w-full" />}
          {sources.isError && <p className="text-sm text-destructive">{t("common.loadError", { message: sources.error.message })}</p>}
          {sources.isSuccess && shown.length === 0 && <p className="text-sm text-muted-foreground">{t("sources.empty")}</p>}
          {shown.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableBody>
                  {shown.map((source) => (
                    <SourceRow key={source.id} source={source} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
