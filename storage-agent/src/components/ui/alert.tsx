import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "../../lib/utils"

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "destructive"
  children?: ReactNode
}

export function Alert({
  className,
  variant = "default",
  children,
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-2 rounded-xl border px-3 py-2 text-xs",
        variant === "default" &&
          "border-border/70 bg-muted/40 text-muted-foreground",
        variant === "destructive" &&
          "border-destructive/40 bg-destructive/10 text-destructive",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

