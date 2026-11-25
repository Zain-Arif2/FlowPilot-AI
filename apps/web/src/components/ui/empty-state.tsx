import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils.js";

interface EmptyStateProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-[#dcdbe6] bg-[#fafafe] px-6 py-10 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#f2effc] text-[#6d4aff]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h4 className="text-sm font-semibold text-[#18181f]">{title}</h4>
      <p className="mt-1 max-w-sm text-sm text-[#686876]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

