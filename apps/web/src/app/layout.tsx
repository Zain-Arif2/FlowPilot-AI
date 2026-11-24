import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "FlowPilot AI",
  description: "A workspace for practical AI-powered workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
