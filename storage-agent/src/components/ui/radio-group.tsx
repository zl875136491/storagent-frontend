import type { HTMLAttributes, ReactElement } from "react"
import { Children, cloneElement, isValidElement } from "react"
import { cn } from "@/lib/utils"

export interface RadioGroupProps extends HTMLAttributes<HTMLDivElement> {
  value?: string
  onValueChange?: (next: string) => void
}

export function RadioGroup({
  className,
  value,
  onValueChange,
  children,
  ...props
}: RadioGroupProps) {
  return (
    <div role="radiogroup" className={cn("flex flex-wrap gap-2", className)} {...props}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child
        return cloneElement(child as ReactElement<any>, {
          __groupValue: value,
          __onGroupValueChange: onValueChange,
        })
      })}
    </div>
  )
}

export interface RadioGroupItemProps extends HTMLAttributes<HTMLButtonElement> {
  value: string
  disabled?: boolean
  __groupValue?: string
  __onGroupValueChange?: (next: string) => void
}

export function RadioGroupItem({
  className,
  value,
  disabled,
  __groupValue,
  __onGroupValueChange,
  children,
  ...props
}: RadioGroupItemProps) {
  const checked = __groupValue === value
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => __onGroupValueChange?.(value)}
      className={cn(
        "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs transition-colors",
        checked
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
      {...props}
    >
      {children ?? value}
    </button>
  )
}

