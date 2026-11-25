"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../../lib/utils.js";

export type ToastTone = "success" | "error" | "warning" | "info";

interface ToastItem {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string;
}

interface ToastContextValue {
  readonly notify: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<
  ToastTone,
  { readonly wrapper: string; readonly icon: typeof Info }
> = {
  success: {
    wrapper: "border-emerald-200 bg-white text-emerald-950",
    icon: CheckCircle2,
  },
  error: {
    wrapper: "border-rose-200 bg-white text-rose-950",
    icon: AlertCircle,
  },
  warning: {
    wrapper: "border-amber-200 bg-white text-amber-950",
    icon: AlertTriangle,
  },
  info: {
    wrapper: "border-[#dfd7fa] bg-white text-[#18181f]",
    icon: Info,
  },
};

const ICON_COLORS: Record<ToastTone, string> = {
  success: "text-emerald-600",
  error: "text-rose-600",
  warning: "text-amber-600",
  info: "text-[#6d4aff]",
};

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5"
      >
        {toasts.map((toast) => {
          const style = TONE_STYLES[toast.tone];
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg transition-all",
                style.wrapper,
              )}
            >
              <Icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_COLORS[toast.tone])}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs text-[#686876]">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-md p-1 text-[#7b7a89] hover:bg-[#f2f1f7] hover:text-[#18181f]"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

