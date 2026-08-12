import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "../../lib/utils"

type ButtonVariant = "default" | "outline" | "ghost" | "secondary" | "destructive"
type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  secondary:
    "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90",
  outline:
    "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive:
    "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-full px-3 text-xs",
  md: "h-9 rounded-full px-3.5 text-xs",
  lg: "h-10 rounded-full px-4 text-sm",
  icon: "h-8 w-8 rounded-full",
  "icon-sm": "h-7 w-7 rounded-full",
}

export function Button({
  className,
  variant = "default",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ring-offset-background text-xs",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  )
}
