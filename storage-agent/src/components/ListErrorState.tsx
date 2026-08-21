import { AlertTriangle, RefreshCw } from "lucide-react"

import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { cn } from "../lib/utils"

interface ListErrorStateProps {
  /** 错误描述，默认「加载失败，请稍后重试」 */
  message?: string
  /** 传入则显示重试按钮 */
  onRetry?: () => void
  /** 重试进行中（禁用按钮并转圈） */
  retrying?: boolean
  /** card：带卡片边框的独立块；plain：无卡片，嵌入面板/表格区域 */
  variant?: "card" | "plain"
  /** 追加到外层容器的类名 */
  className?: string
}

/** 列表加载失败时的统一错误态：图标 + 文案 + 重试入口，替代误导性的「暂无数据」空态 */
export function ListErrorState({
  message = "加载失败，请稍后重试",
  onRetry,
  retrying = false,
  variant = "card",
  className,
}: ListErrorStateProps) {
  const body = (
    <>
      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
      <div className="text-sm font-medium text-foreground">{message}</div>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 gap-1.5"
          onClick={onRetry}
          disabled={retrying}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", retrying && "animate-spin")}
            aria-hidden
          />
          重试
        </Button>
      ) : null}
    </>
  )

  if (variant === "plain") {
    return (
      <div
        className={cn(
          "flex min-h-[10rem] flex-1 flex-col items-center justify-center gap-2 text-center",
          className,
        )}
      >
        {body}
      </div>
    )
  }

  return (
    <Card
      className={cn(
        "flex min-h-[160px] flex-col items-center justify-center border-dashed bg-muted/40",
        className,
      )}
    >
      <CardContent className="flex flex-col items-center gap-2 pt-0">
        {body}
      </CardContent>
    </Card>
  )
}
