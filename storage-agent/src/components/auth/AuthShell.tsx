import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"

interface AuthShellProps {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-3 flex flex-col items-center gap-2">
            <img
              src="/brand-mark.png"
              alt="Storagent"
              className="h-16 w-16 object-contain"
            />
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Storagent
            </div>
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {children}
          {footer ? (
            <div className="mt-5 border-t border-border/70 pt-4 text-center text-xs text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
