"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FormSubmitButtonProps extends Omit<ButtonProps, "type" | "children"> {
  idleLabel: string;
  pendingLabel?: string;
}

export function FormSubmitButton({
  idleLabel,
  pendingLabel = "Saving...",
  disabled,
  className,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={cn("gap-2", className)}
      {...props}
    >
      {pending ? (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden="true"
        />
      ) : null}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
