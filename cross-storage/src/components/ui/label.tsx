import type { LabelHTMLAttributes, ReactNode } from "react"
import { cn } from "../../lib/utils"

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children?: ReactNode
}

export function Label({ className, children, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "block text-[11px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  )
}

