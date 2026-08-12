import { cn } from "@/lib/utils"

type BrandLoadingProps = {
  label?: string
  className?: string
  iconClassName?: string
  compact?: boolean
}
/** Shared loading state for page/content requests; action-level spinners stay lightweight. */
export function BrandLoading({
  label = "正在加载...",
  className,
  iconClassName,
  compact = false,
}: BrandLoadingProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 text-xs text-muted-foreground", compact ? "py-8" : "min-h-[200px]", className)}>
      <img
        src="/brand-mark.png"
        alt=""
        className={cn("brand-mark-loading object-contain", compact ? "h-8 w-8" : "h-12 w-12", iconClassName)}
        aria-hidden
      />
      <span>{label}</span>
    </div>
  )
}
