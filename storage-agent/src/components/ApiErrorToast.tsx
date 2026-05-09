import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { XIcon } from "lucide-react"
import { Button } from "./ui/button"

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n")
}

function formatTracebackForDisplay(traceback: string): string {
  const normalized = normalizeNewlines(traceback).trim()
  if (!normalized) return ""

  try {
    const parsed = JSON.parse(normalized) as unknown
    return JSON.stringify(parsed, null, 2)
  } catch {
    // 非合法 JSON 时，按原始文本展示
    return normalized
  }
}

function renderTracebackWithLineNumbers(traceback: string) {
  const formatted = formatTracebackForDisplay(traceback)
  const lines = formatted.split("\n")
  // 行号列需要固定宽度，保证代码区对齐
  return (
    <pre className="m-0 overflow-x-auto whitespace-pre font-mono text-xs leading-5">
      {lines.map((line, idx) => (
        <span key={idx} className="block">
          <span className="inline-block w-10 select-none pr-2 text-right text-[11px] text-muted-foreground">
            {idx + 1}
          </span>
          <code>{line.length ? line : " "}</code>
        </span>
      ))}
    </pre>
  )
}

export interface ApiErrorToastProps {
  msg: string
  type: string
  description?: string | null
  traceback?: string | null
  /** 无 traceback 但 data 过长时，点击「更多」展示全文 */
  dataForModal?: string | null
}

type DetailModalKind = "traceback" | "data"

export function ApiErrorToast({
  msg,
  type,
  description,
  traceback,
  dataForModal,
}: ApiErrorToastProps) {
  const [modal, setModal] = useState<DetailModalKind | null>(null)

  const hasTraceback = useMemo(() => {
    return typeof traceback === "string" && traceback.trim().length > 0
  }, [traceback])

  const hasDataModal = useMemo(() => {
    return typeof dataForModal === "string" && dataForModal.trim().length > 0
  }, [dataForModal])

  const modalBody =
    modal === "traceback" && hasTraceback
      ? traceback!.trim()
      : modal === "data" && hasDataModal
        ? dataForModal!.trim()
        : null

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold">{msg}</div>
            <span className="inline-flex shrink-0 items-center rounded-md border border-border/80 bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
              {type}
            </span>
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {description?.trim() || msg}
          </div>
        </div>
        {hasTraceback && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setModal("traceback")}
            className="shrink-0"
          >
            More
          </Button>
        )}
        {!hasTraceback && hasDataModal && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setModal("data")}
            className="shrink-0"
          >
            更多
          </Button>
        )}
      </div>

      {modal && modalBody && typeof document !== "undefined" &&
        createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null)
          }}
        >
          <div className="relative flex h-[86vh] w-[min(96vw,1200px)] flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border/70">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label="关闭"
              onClick={() => setModal(null)}
              className="absolute right-4 top-4 z-10"
            >
              <XIcon className="h-4 w-4" />
            </Button>

            <div className="border-b border-border/70 px-6 py-5 pr-16">
              {modal === "traceback" ? (
                <>
                  <div className="text-base font-semibold">Traceback</div>
                  <div className="mt-1 text-xs text-muted-foreground">{msg}</div>
                </>
              ) : (
                <div className="text-base font-semibold leading-snug">{msg}</div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto bg-muted/30 p-5">
              <div className="docs-scroll h-full overflow-auto rounded-md border border-border/70 bg-muted/20 p-3">
                {renderTracebackWithLineNumbers(modalBody)}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

