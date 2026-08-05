import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number
  indicatorClassName?: string
}

export function Progress({ value = 0, className, indicatorClassName, ...props }: ProgressProps) {
  const v = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn("h-full bg-primary transition-all", indicatorClassName)}
        style={{ width: `${v}%` }}
      />
    </div>
  )
}
