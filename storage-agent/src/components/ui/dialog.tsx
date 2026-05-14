import type { HTMLAttributes, ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "../../lib/utils"

export interface DialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open || typeof document === "undefined") return null

  /* 挂到 body：避免祖先的 backdrop-filter / transform 把 fixed 变成「相对局部容器」 */
  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div
        role="presentation"
        aria-hidden
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="pointer-events-none absolute inset-0 overflow-y-auto overscroll-contain">
        <div className="flex min-h-[100dvh] w-full items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:p-4">
          <div className="pointer-events-auto mx-auto w-full max-w-xl shrink-0 px-0 sm:px-1">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DialogContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative w-full max-w-xl rounded-2xl bg-card p-6 text-card-foreground shadow-xl ring-1 ring-border/70",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function DialogHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-4 flex shrink-0 items-center justify-between gap-4", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function DialogTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-base font-semibold leading-none tracking-tight", className)}
      {...props}
    >
      {children}
    </h2>
  )
}

export function DialogBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function DialogFooter({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-4 flex items-center justify-end gap-2", className)}
      {...props}
    >
      {children}
    </div>
  )
}

