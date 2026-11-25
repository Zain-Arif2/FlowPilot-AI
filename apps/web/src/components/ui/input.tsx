import * as React from "react";
import { cn } from "../../lib/utils.js";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "block text-xs font-semibold tracking-wide text-[#383745]",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full min-w-0 rounded-lg border border-[#dedee8] bg-white px-3 py-2 text-sm text-[#18181f] placeholder:text-[#8f8e9e] transition-colors focus:border-[#6d4aff] focus:outline-none focus:ring-2 focus:ring-[#6d4aff]/15 disabled:cursor-not-allowed disabled:bg-[#f7f7fa] disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[88px] w-full min-w-0 rounded-lg border border-[#dedee8] bg-white px-3 py-2.5 text-sm text-[#18181f] placeholder:text-[#8f8e9e] transition-colors focus:border-[#6d4aff] focus:outline-none focus:ring-2 focus:ring-[#6d4aff]/15 disabled:cursor-not-allowed disabled:bg-[#f7f7fa] disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full min-w-0 rounded-lg border border-[#dedee8] bg-white px-3 py-2 text-sm text-[#18181f] transition-colors focus:border-[#6d4aff] focus:outline-none focus:ring-2 focus:ring-[#6d4aff]/15 disabled:cursor-not-allowed disabled:bg-[#f7f7fa] disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";

