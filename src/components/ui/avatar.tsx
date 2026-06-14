import * as React from "react"
import { cn } from "@/lib/utils"

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg"
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size = "md", ...props }, ref) => {
    const sizeClasses = {
      sm: "h-7 w-7 text-xs",
      md: "h-9 w-9 text-sm",
      lg: "h-12 w-12 text-base",
    }
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground overflow-hidden",
          sizeClasses[size],
          className
        )}
        {...props}
      />
    )
  }
)
Avatar.displayName = "Avatar"

function AvatarImage({ src, alt, className }: { src?: string; alt?: string; className?: string }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt || ""}
      className={cn("h-full w-full object-cover", className)}
    />
  )
}

function AvatarFallback({
  children,
  className,
  delayMs,
}: {
  children: React.ReactNode
  className?: string
  delayMs?: number
}) {
  const [show, setShow] = React.useState(!delayMs)

  React.useEffect(() => {
    if (delayMs) {
      const timer = setTimeout(() => setShow(true), delayMs)
      return () => clearTimeout(timer)
    }
  }, [delayMs])

  if (!show) return null
  return (
    <span className={cn("flex h-full w-full items-center justify-center", className)}>
      {children}
    </span>
  )
}

export { Avatar, AvatarImage, AvatarFallback }
