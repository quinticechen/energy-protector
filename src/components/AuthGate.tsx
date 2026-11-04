import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, LogOut } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut, useIsAdmin, useSession } from "@/hooks/useSession";
import { LoginPage } from "@/pages/LoginPage";

function CenteredSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground" role="status">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      {t("common.loading")}
    </div>
  );
}

/** Shows the app only to signed-in admins. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { session, loading } = useSession();
  const isAdmin = useIsAdmin(session?.user.id);

  if (loading) return <CenteredSpinner />;
  if (!session) return <LoginPage />;
  if (isAdmin.isPending) return <CenteredSpinner />;
  if (!isAdmin.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>{t("auth.notAdminTitle")}</CardTitle>
              <CardDescription>{t("auth.notAdminBody", { email: session.user.email })}</CardDescription>
            </div>
            <IconButton icon={LogOut} label={t("actions.signOut")} variant="outline" onClick={() => void signOut()} />
          </CardHeader>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
