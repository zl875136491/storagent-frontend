import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import { GripHorizontal } from "lucide-react"

import { cn } from "../../lib/utils"

const HANDLE_SIZE = 12
const DEFAULT_TOP_HEIGHT = 240
const KEY_STEP = 16
const KEY_STEP_FAST = 48

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function gridColumnCount(template: string) {
  if (!template || template === "none") return 1
  return template.split(/\s+/).filter(Boolean).length || 1
}

function outerBlockHeight(element: HTMLElement): number {
  const style = getComputedStyle(element)
  return (
    Math.max(element.offsetHeight, element.scrollHeight) +
    (Number.parseFloat(style.marginTop) || 0) +
    (Number.parseFloat(style.marginBottom) || 0)
  )
}

function measureBoundedSplitContent(root: HTMLElement): number {
  const grid = root.matches("[data-bounded-split-content]")
    ? root
    : root.querySelector<HTMLElement>("[data-bounded-split-content]") ?? root
  const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-bounded-split-card]"))
  if (!cards.length) return Math.max(0, grid.scrollHeight)
  const heights = cards.map((card) => {
    const header = card.querySelector<HTMLElement>("[data-bounded-split-card-header]")
    const table = card.querySelector("table")
    const headerHeight = Math.max(header?.offsetHeight ?? 0, header?.scrollHeight ?? 0)
    const tableHeight = table?.scrollHeight ?? 0
    return headerHeight + tableHeight + 2
  })
  const columns = gridColumnCount(getComputedStyle(grid).gridTemplateColumns)
  if (columns <= 1) {
    const gap = Number.parseFloat(getComputedStyle(grid).rowGap || "0") || 0
    return heights.reduce((total, height) => total + height, 0) + gap * Math.max(heights.length - 1, 0)
  }
  return Math.max(0, ...heights)
}

function measureSplitHeights(root: HTMLElement): { min: number; max: number } {
  const tables = measureBoundedSplitContent(root)
  const summary = root.matches("[data-bounded-split-summary]")
    ? root
    : root.querySelector<HTMLElement>("[data-bounded-split-summary]")
  if (!summary) return { min: 0, max: tables }
  return { min: tables, max: tables + outerBlockHeight(summary) }
}

export function BoundedVerticalSplit({
  top,
  bottom,
  measureKey,
  defaultTopHeight = DEFAULT_TOP_HEIGHT,
  className,
}: {
  top: ReactNode
  bottom: ReactNode
  measureKey?: string | number
  defaultTopHeight?: number
  className?: string
}) {
  const groupRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const topHeightRef = useRef(defaultTopHeight)
  const minHeightRef = useRef(0)
  const maxHeightRef = useRef(defaultTopHeight)
  const userAdjustedRef = useRef(false)
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)
  const lastNaturalRef = useRef({ min: 0, max: defaultTopHeight })
  const [topHeight, setTopHeight] = useState(defaultTopHeight)
  const [minHeight, setMinHeight] = useState(0)
  const [maxHeight, setMaxHeight] = useState(defaultTopHeight)
  const [dragging, setDragging] = useState(false)

  useLayoutEffect(() => {
    topHeightRef.current = topHeight
    minHeightRef.current = minHeight
    maxHeightRef.current = maxHeight
  }, [maxHeight, minHeight, topHeight])

  useLayoutEffect(() => {
    if (!dragging) return
    const previous = document.body.style.userSelect
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.userSelect = previous
    }
  }, [dragging])

  const syncBounds = useCallback(() => {
    const group = groupRef.current
    const content = contentRef.current
    if (!group || !content) return
    const measured = measureSplitHeights(content)
    if (measured.max > 1) lastNaturalRef.current = measured
    const natural = measured.max > 1 ? measured : lastNaturalRef.current
    const available = Math.max(0, group.clientHeight - HANDLE_SIZE)
    const nextMax = Math.round(clamp(natural.max, 0, available))
    let nextMin = Math.round(clamp(natural.min, 0, nextMax))
    if (nextMin >= nextMax && natural.max > natural.min) {
      nextMin = Math.round(clamp(nextMax - (natural.max - natural.min), 0, nextMax))
    }
    minHeightRef.current = nextMin
    maxHeightRef.current = nextMax
    setMinHeight(nextMin)
    setMaxHeight(nextMax)
    const nextHeight = Math.round(
      userAdjustedRef.current
        ? clamp(topHeightRef.current, nextMin, nextMax)
        : nextMax,
    )
    if (nextHeight !== topHeightRef.current) {
      topHeightRef.current = nextHeight
      setTopHeight(nextHeight)
    }
  }, [])

  useLayoutEffect(() => {
    const group = groupRef.current
    const content = contentRef.current
    if (!group || !content) return
    syncBounds() // eslint-disable-line react-hooks/set-state-in-effect -- 读取 DOM 高度后写入滑杆上下限
    const observer = new ResizeObserver(() => syncBounds())
    observer.observe(group)
    observer.observe(content)
    const summary = content.querySelector("[data-bounded-split-summary]")
    if (summary) observer.observe(summary)
    for (const table of content.querySelectorAll("table")) observer.observe(table)
    return () => observer.disconnect()
  }, [measureKey, syncBounds])

  const assignHeight = useCallback((next: number) => {
    userAdjustedRef.current = true
    const bounded = Math.round(clamp(next, minHeightRef.current, maxHeightRef.current))
    topHeightRef.current = bounded
    setTopHeight(bounded)
  }, [])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic or unsupported pointer capture should not block dragging.
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: topHeightRef.current,
    }
    setDragging(true)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    assignHeight(drag.startHeight + (event.clientY - drag.startY))
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP_FAST : KEY_STEP
    if (event.key === "ArrowUp") {
      event.preventDefault()
      assignHeight(topHeightRef.current - step)
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      assignHeight(topHeightRef.current + step)
    } else if (event.key === "Home") {
      event.preventDefault()
      assignHeight(minHeightRef.current)
    } else if (event.key === "End") {
      event.preventDefault()
      assignHeight(maxHeightRef.current)
    }
  }

  const atMin = topHeight <= minHeight
  const atMax = maxHeight <= minHeight || topHeight >= maxHeight
  const atBound = atMin || atMax

  return (
    <div ref={groupRef} className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <div
        className="flex min-h-0 shrink-0 flex-col justify-end overflow-hidden"
        style={{ height: topHeight }}
        aria-hidden={atMin && minHeight <= 0 ? true : undefined}
      >
        <div ref={contentRef} className="shrink-0">
          {top}
        </div>
      </div>
      <div
        role="slider"
        aria-orientation="horizontal"
        aria-label="调整概览与任务执行区域的高度"
        aria-valuemin={minHeight}
        aria-valuemax={maxHeight}
        aria-valuenow={topHeight}
        aria-valuetext={
          atMin
            ? minHeight <= 0 ? "概览已收起" : "简要信息已收起"
            : atMax ? "概览已完全展开" : `概览高度 ${topHeight} 像素`
        }
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "group relative z-10 flex shrink-0 cursor-row-resize items-center justify-center",
          "touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
        )}
        style={{ height: HANDLE_SIZE }}
      >
        <span
          className={cn(
            "pointer-events-none h-px w-full transition-colors",
            atBound ? "bg-primary" : "bg-border group-hover:bg-primary/60",
          )}
        />
        <span
          className={cn(
            "pointer-events-none absolute flex h-4 w-8 items-center justify-center rounded-sm border shadow-sm transition-colors",
            atBound
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground group-hover:border-primary/70 group-hover:text-primary",
          )}
        >
          <GripHorizontal className="size-3.5" aria-hidden />
        </span>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{bottom}</div>
    </div>
  )
}
