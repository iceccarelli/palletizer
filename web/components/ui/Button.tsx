// THE button. One radius (pill), fixed heights, fixed padding, one transition.
// Replaces the hand-rolled buttons across the app. For links, use
// buttonVariants() on a <Link> so anchors and buttons look identical.
//
//   import { Button, buttonVariants } from "@/components/ui/Button";
//   <Button size="lg">Try the live optimizer</Button>
//   <Link href="/demo" className={buttonVariants({ variant: "outline", size: "lg" })}>Docs</Link>

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-semibold rounded-pill leading-none",
    "transition-[transform,background-color,border-color,opacity] duration-150 ease-out",
    "active:translate-y-px",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:opacity-50 disabled:pointer-events-none",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-border text-foreground hover:bg-foreground/5 hover:border-foreground/25",
        ghost: "text-foreground/70 hover:text-foreground hover:bg-foreground/5",
      },
      size: {
        // heights are deliberate: md = 44px (min touch target), lg = 52px
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-[52px] px-7 text-base",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";
