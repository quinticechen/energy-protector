import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { signInWithGoogle } from "@/hooks/useSession";

export function LoginPage() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setPending(false);
      toast.error(t("auth.error", { message: error instanceof Error ? error.message : String(error) }));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("app.name")}</CardTitle>
          <CardDescription>{t("app.tagline")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("auth.description")}</p>
          {/* The one labelled button: a lone icon would not explain how to sign in. */}
          <Button className="w-full" onClick={() => void signIn()} disabled={pending}>
            <LogIn className="mr-2 h-4 w-4" aria-hidden />
            {t("actions.signIn")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
