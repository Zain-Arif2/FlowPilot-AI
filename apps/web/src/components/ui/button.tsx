import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[#6d4aff] text-white shadow-xs hover:bg-[#5b3be0] active:scale-[0.99]",
        secondary:
          "bg-[#f3f2f7] text-[#22212c] border border-[#e3e2ec] hover:bg-[#eae8f2]",
        outline:
          "border border-[#e2e2ea] bg-white text-[#22212c] shadow-2xs hover:bg-[#f7f7fa] hover:border-[#d3d2df]",
        ghost: "text-[#545363] hover:bg-[#f2f1f7] hover:text-[#18181f]",
        destructive:
          "bg-[#e11d48] text-white shadow-xs hover:bg-[#be123c]",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-md",
        md: "h-9 px-4 text-sm",
        lg: "h-10 px-5 text-sm",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

