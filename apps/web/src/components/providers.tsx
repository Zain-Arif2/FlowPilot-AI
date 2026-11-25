"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "./ui/toast.js";

export function Providers({ children }: { readonly children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

