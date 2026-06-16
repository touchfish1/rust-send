import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-[border-color,background-color,box-shadow] duration-300",
          "placeholder:text-muted-foreground/50",
          "focus-visible:outline-none focus-visible:border-primary/40 focus-visible:bg-card/80 focus-visible:ring-2 focus-visible:ring-primary/10 focus-visible:ring-offset-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
