import { Button } from "./ui/button"
import { useTheme } from "./theme-provider"

export function ModeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label="切换亮暗模式"
      className="border-border/70"
    >
      <span className="text-[13px] font-semibold">
        {theme === "dark" ? "☾" : "☼"}
      </span>
    </Button>
  )
}

