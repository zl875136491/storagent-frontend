import type { InputHTMLAttributes } from "react"
import { cn } from "../../lib/utils"

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}
