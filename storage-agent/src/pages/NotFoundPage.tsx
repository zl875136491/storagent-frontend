import { Link, useLocation } from "react-router-dom"
import { Compass } from "lucide-react"

import { useDocumentTitle } from "../lib/useDocumentTitle"

export default function NotFoundPage() {
  useDocumentTitle("页面不存在")
  const location = useLocation()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center text-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
        <Compass className="h-7 w-7 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <p className="text-4xl font-semibold tracking-tight">404</p>
        <h1 className="text-base font-medium">页面不存在或已被移动</h1>
        <p className="max-w-md break-all text-xs text-muted-foreground">
          当前地址：{location.pathname}
        </p>
      </div>
      <Link
        to="/docs/overview"
        replace
        className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
      >
        返回首页
      </Link>
    </div>
  )
}
