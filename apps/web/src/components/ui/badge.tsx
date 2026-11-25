import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[#f2f1f6] text-[#454454] border border-[#e3e2ec]",
        purple: "bg-[#f2effc] text-[#5b3be0] border border-[#dfd7fa]",
        success: "bg-emerald-50 text-emerald-700 border border-emerald-200/80",
        warning: "bg-amber-50 text-amber-800 border border-amber-200/80",
        destructive: "bg-rose-50 text-rose-700 border border-rose-200/80",
        outline: "border border-[#dcdbe6] text-[#545363] bg-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

