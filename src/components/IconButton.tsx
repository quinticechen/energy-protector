import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

export interface IconButtonProps extends Omit<ButtonProps, "children" | "size"> {
  icon: LucideIcon;
  /** Action name, used for aria-label and the hover title. */
  label: string;
  loading?: boolean;
}

/** Icon-only action button (workspace convention): the name lives in aria-label and title. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, label, loading = false, disabled, variant = "ghost", ...props }, ref) => (
    <Button ref={ref} size="icon" variant={variant} aria-label={label} title={label} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
    </Button>
  ),
);
IconButton.displayName = "IconButton";
