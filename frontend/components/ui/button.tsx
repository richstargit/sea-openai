import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * Pills, like Apple's. Feedback lands on pointer-down (the :active scale),
 * never on release. Primary is the one orange fill on a screen.
 */
const buttonVariants = cva(
  "pressable group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.1em]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-brand-hover",
        dark: "bg-foreground text-background hover:bg-foreground/85",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline:
          "border-foreground/25 bg-transparent text-foreground hover:bg-foreground/6",
        ghost: "text-foreground hover:bg-foreground/6",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15",
        link: "rounded-md text-brand-text hover:underline underline-offset-4",
      },
      size: {
        default: "min-h-11 gap-2 px-5 text-[1.0625rem]",
        xs: "min-h-8 gap-1 px-3 text-[0.875rem]",
        sm: "min-h-9 gap-1.5 px-4 text-[0.9375rem]",
        lg: "min-h-14 gap-2 px-8 text-[1.1875rem]",
        icon: "size-11",
        "icon-sm": "size-9",
        "icon-lg": "size-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
