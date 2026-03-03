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
}

export function Modal({ title, onClose, children, disableClose }: ModalProps) {
  return (
    <Dialog open>
      <DialogContent>
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
        <DialogBody>{children}</DialogBody>
      </DialogContent>
    </Dialog>
  )
}

