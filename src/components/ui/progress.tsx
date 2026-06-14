import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  variant?: "default" | "success" | "warning" | "error"
  size?: "sm" | "md" | "lg"
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, variant = "default", size = "md", ...props }, ref) => {
    const clampedValue = Math.min(100, Math.max(0, value))

    const variantStyles = {
      default: "bg-primary",
      success: "bg-success",
      warning: "bg-warning",
      error: "bg-destructive",
    }

    const sizeStyles = {
      sm: "h-1",
      md: "h-1.5",
      lg: "h-2",
    }

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-border/40",
          sizeStyles[size],
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full w-full rounded-full transition-all duration-300 ease-out",
            variantStyles[variant]
          )}
          style={{
            transform: `translateX(-${100 - clampedValue}%)`,
            boxShadow: clampedValue > 0 && clampedValue < 100
              ? `0 0 6px -2px hsl(var(--${variant === "default" ? "primary" : variant}) / 0.3)`
              : "none",
          }}
        />
        {/* 墨迹渐变尾端 */}
        {clampedValue < 100 && clampedValue > 0 && (
          <div
            className={cn(
              "absolute top-0 bottom-0 w-4 rounded-full",
              variantStyles[variant]
            )}
            style={{
              left: `${clampedValue}%`,
              transform: "translateX(-100%)",
              opacity: 0.3,
              filter: "blur(3px)",
            }}
          />
        )}
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }
