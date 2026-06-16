import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[transform,background-color,color,box-shadow,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none will-change-transform",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_10px_24px_-18px_hsl(var(--primary)/0.9)] hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[0.985]",
        destructive:
          "bg-destructive text-destructive-foreground hover:-translate-y-0.5 hover:bg-destructive/90 active:translate-y-0 active:scale-[0.985]",
        outline:
          "border border-border bg-transparent hover:-translate-y-0.5 hover:bg-muted active:translate-y-0 active:bg-muted/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:-translate-y-0.5 hover:bg-secondary/80 active:translate-y-0 active:scale-[0.985]",
        ghost:
          "hover:-translate-y-0.5 hover:bg-muted active:translate-y-0 active:bg-muted/80",
        link:
          "text-foreground underline-offset-4 hover:underline",
        "ink-ghost":
          "relative text-foreground/60 hover:-translate-y-0.5 hover:text-foreground after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:h-[1px] after:w-0 after:bg-foreground/20 after:transition-all after:duration-200 hover:after:w-3/4",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-sm px-3 text-xs",
        lg: "h-10 px-6",
        xl: "h-12 px-8 text-base",
        icon: "h-9 w-9",
      },
      roundness: {
        default: "rounded-md",
        sharp: "rounded-sm",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      roundness: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, roundness, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, roundness, className })}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
