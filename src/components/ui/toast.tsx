import * as React from "react"
import { cn } from "@/lib/utils"

interface Toast {
  id: string
  message: string
  variant?: "info" | "success" | "error" | "warning"
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, "id">) => void
  removeToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextType>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
})

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, toast.duration ?? 5000)
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "rounded-md border px-4 py-3 text-sm shadow-ink-md animate-ink-fade cursor-pointer",
              toast.variant === "success" && "border-success/30 bg-success/5 text-success",
              toast.variant === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
              toast.variant === "warning" && "border-warning/30 bg-warning/5 text-warning",
              (!toast.variant || toast.variant === "info") && "border-border/60 bg-card text-foreground",
            )}
            onClick={() => removeToast(toast.id)}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function useToast() {
  const ctx = React.useContext(ToastContext)
  return {
    toast: (msg: string, variant?: Toast["variant"]) => ctx.addToast({ message: msg, variant }),
    ...ctx,
  }
}

export { ToastProvider, useToast }
