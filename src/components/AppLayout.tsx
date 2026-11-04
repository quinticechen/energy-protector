import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { RunNowButton } from "@/components/RunNowButton";
import { signOut } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", key: "nav.sources" },
  { to: "/filters", key: "nav.filters" },
  { to: "/runs", key: "nav.runs" },
] as const;

export function AppLayout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center gap-4">
          <span className="font-semibold tracking-tight">{t("app.name")}</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                    isActive && "bg-muted font-medium text-foreground",
                  )
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <RunNowButton />
            <LanguageSwitcher />
            <IconButton icon={LogOut} label={t("actions.signOut")} onClick={() => void signOut()} />
          </div>
        </div>
      </header>
      <main className="container py-6">
        <Outlet />
      </main>
    </div>
  );
}
