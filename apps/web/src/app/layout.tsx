import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "../components/providers.js";

export const metadata: Metadata = {
  title: "FlowPilot AI — Intelligent Workflow Automation",
  description:
    "Turn ideas into automated document workflows with AI. Generate, customize visually, and execute with human-in-the-loop approvals.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "FlowPilot AI — Intelligent Workflow Automation",
    description:
      "Describe a task in natural language, generate validated workflows with AI, and execute them with human approvals.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f8f8fa] font-sans text-[#18181f] antialiased selection:bg-[#7659d6]/15 selection:text-[#4c32a8]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
