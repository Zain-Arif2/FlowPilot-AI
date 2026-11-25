import { cn } from "../../lib/utils.js";

interface FlowPilotLogoProps {
  readonly variant?: "dark" | "light";
  readonly size?: "sm" | "md";
  readonly showWordmark?: boolean;
  readonly className?: string;
}

export function FlowPilotLogo({
  variant = "dark",
  size = "md",
  showWordmark = true,
  className,
}: FlowPilotLogoProps) {
  const iconDimension = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const textSize = size === "sm" ? "text-sm" : "text-[15px]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 select-none",
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={cn(iconDimension, "shrink-0")}
      >
        <rect width="32" height="32" rx="8" fill="#6D4AFF" />
        <path
          d="M9.5 11H15.5L19.5 16L15.5 21H9.5"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17.5 11L22.5 16L17.5 21"
          stroke="#C8B9FF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9.5" cy="11" r="2" fill="#FFFFFF" />
        <circle cx="9.5" cy="21" r="2" fill="#FFFFFF" />
        <circle cx="22.5" cy="16" r="2" fill="#C8B9FF" />
      </svg>

      {showWordmark ? (
        <span
          className={cn(
            "font-semibold tracking-tight",
            textSize,
            variant === "dark" ? "text-white" : "text-[#18181f]",
          )}
        >
          FlowPilot{" "}
          <span
            className={
              variant === "dark" ? "text-[#a58fff]" : "text-[#6d4aff]"
            }
          >
            AI
          </span>
        </span>
      ) : null}
    </span>
  );
}
