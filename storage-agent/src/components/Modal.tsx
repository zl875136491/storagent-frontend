import type { ReactNode } from "react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { XIcon } from "lucide-react"

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  disableClose?: boolean
  /** 合并到 DialogContent（如纵向 flex + max-h） */
  contentClassName?: string
  /** 合并到 DialogBody，用于单场景覆盖默认 max-h 等 */
  bodyClassName?: string
}

export function Modal({
  title,
  onClose,
  children,
  disableClose,
  contentClassName,
  bodyClassName,
}: ModalProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !disableClose) onClose()
      }}
    >
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="关闭"
            disabled={disableClose}
            onClick={() => {
              if (disableClose) return
              onClose()
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <DialogBody className={bodyClassName}>{children}</DialogBody>
      </DialogContent>
    </Dialog>
  )
}

