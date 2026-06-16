import { cn } from "@/lib/utils"

type AppMarkProps = {
  className?: string
  size?: "sm" | "md" | "lg"
}

const sizeStyles = {
  sm: "h-5 w-5 rounded-[4px]",
  md: "h-10 w-10 rounded-[8px]",
  lg: "h-20 w-20 rounded-[16px]",
}

const iconSizes = {
  sm: "h-3 w-3",
  md: "h-6 w-6",
  lg: "h-12 w-12",
}

export function AppMark({ className, size = "md" }: AppMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center bg-primary text-primary-foreground shadow-[0_12px_30px_-20px_hsl(var(--primary)/0.9)]",
        sizeStyles[size],
        className
      )}
      aria-label="rust-send 标识"
    >
      <svg
        viewBox="0 0 64 64"
        className={iconSizes[size]}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 17h16l6 6v18a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4V21a4 4 0 0 1 4-4Z" />
        <path d="M37 17v8h8" />
        <path d="M24 35h15" />
        <path d="m34 29 5.5 5.5L34 40" />
      </svg>
    </span>
  )
}
