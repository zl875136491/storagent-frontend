import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "./ui/button"

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "未知错误"
    return { hasError: true, message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("UI ErrorBoundary:", error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleClearSession = () => {
    try {
      localStorage.removeItem("cross_storage_access_token")
      localStorage.removeItem("cross_storage_refresh_token")
    } catch {
      // ignore
    }
    window.location.href = "/login"
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <h1 className="text-xl font-semibold">页面出现异常</h1>
        <p className="max-w-md text-sm text-muted-foreground">{this.state.message}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={this.handleReload}>
            刷新页面
          </Button>
          <Button type="button" variant="outline" onClick={this.handleClearSession}>
            清除会话并重新登录
          </Button>
        </div>
      </div>
    )
  }
}
