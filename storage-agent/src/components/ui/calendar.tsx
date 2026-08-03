import type { ComponentProps } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "../../lib/utils"

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit p-3", className)}
      classNames={{
        root: cn("relative", defaults.root),
        months: "flex flex-col gap-5 md:flex-row md:gap-4",
        month: "flex w-full flex-col gap-3",
        month_caption: "relative flex h-8 items-center justify-center",
        caption_label: "text-xs font-medium",
        nav: "absolute inset-x-3 top-3 z-10 flex h-8 items-center justify-between pointer-events-none",
        button_previous: cn(
          "pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground",
          "transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ),
        button_next: cn(
          "pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground",
          "transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-[10px] font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: cn(
          "relative h-9 w-9 p-0 text-center text-xs",
          "has-[[aria-selected].day-range-end]:rounded-r-md has-[[aria-selected].day-range-start]:rounded-l-md",
        ),
        day_button: cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md font-normal",
          "transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "aria-selected:opacity-100",
        ),
        range_start: "day-range-start bg-primary text-primary-foreground",
        range_end: "day-range-end bg-primary text-primary-foreground",
        range_middle: "bg-accent text-accent-foreground",
        selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        today: "bg-muted font-medium text-foreground",
        outside: "text-muted-foreground/45 aria-selected:text-muted-foreground/60",
        disabled: "pointer-events-none text-muted-foreground/35",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) => {
          const iconClassName = cn("h-4 w-4", chevronClassName)
          if (orientation === "left") return <ChevronLeft className={iconClassName} />
          if (orientation === "right") return <ChevronRight className={iconClassName} />
          if (orientation === "up") return <ChevronUp className={iconClassName} />
          return <ChevronDown className={iconClassName} />
        },
      }}
      {...props}
    />
  )
}
