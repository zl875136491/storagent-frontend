import { useMemo, useState } from "react"
import { CalendarDays, ChevronDown } from "lucide-react"

import { Calendar } from "./calendar"
import { Button } from "./button"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Input } from "./input"
import { cn } from "../../lib/utils"

function parseDateValue(value?: string): Date | undefined {
  if (!value) return undefined
  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day, 12)
}

function formatDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function displayDateValue(value?: string, placeholder = "请选择日期"): string {
  return value ? value.slice(0, 10) : placeholder
}

export interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  "aria-label"?: string
  className?: string
}

/** A compact shadcn-style date field that keeps the API value in YYYY-MM-DD form. */
export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  id,
  className,
  ...ariaProps
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => parseDateValue(value), [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("h-9 w-full justify-start gap-2 rounded-md px-3 font-normal", className)}
          {...ariaProps}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn("min-w-0 flex-1 truncate text-left text-xs", !value && "text-muted-foreground")}>
            {displayDateValue(value, placeholder)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return
            onChange(formatDateValue(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export interface DateTimePickerProps extends Omit<DatePickerProps, "value" | "onChange"> {
  value?: string
  onChange: (value: string) => void
}

function displayDateTimeValue(value?: string, placeholder = "请选择时间"): string {
  return value ? value.replace("T", " ") : placeholder
}

/** Calendar picker with a small time field, emitting local YYYY-MM-DDTHH:mm values. */
export function DateTimePicker({
  value,
  onChange,
  placeholder,
  disabled,
  id,
  className,
  ...ariaProps
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => parseDateValue(value), [value])
  const timeValue = value?.slice(11, 16) || "00:00"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("h-9 w-full justify-start gap-2 rounded-md px-3 font-normal", className)}
          {...ariaProps}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn("min-w-0 flex-1 truncate text-left text-xs", !value && "text-muted-foreground")}>
            {displayDateTimeValue(value, placeholder)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return
            onChange(`${formatDateValue(date)}T${timeValue}`)
          }}
        />
        <div className="border-t border-border p-3">
          <label className="text-[10px] text-muted-foreground">
            <span className="mb-1.5 block">时间（UTC+8）</span>
            <Input
              type="time"
              step="60"
              className="h-8 text-xs"
              value={timeValue}
              disabled={disabled}
              onChange={(event) => {
                const dateValue = value?.slice(0, 10)
                if (dateValue && event.target.value) onChange(`${dateValue}T${event.target.value}`)
              }}
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  )
}
