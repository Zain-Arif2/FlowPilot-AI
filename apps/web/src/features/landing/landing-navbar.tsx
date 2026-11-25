"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { FlowPilotLogo } from "../../components/brand/flowpilot-logo.js";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#faq", label: "FAQ" },
] as const;

export function LandingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" })
      .then((res) => {
        if (active && res.ok) setIsAuthenticated(true);
      })
      .catch(() => {
        // Unauthenticated visitor; keep default Login / Get Started CTAs
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#121118]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="FlowPilot AI home">
          <FlowPilotLogo variant="dark" size="md" />
        </Link>

        <nav
          aria-label="Landing navigation"
          className="hidden items-center gap-7 md:flex"
        >
          {NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-2 text-sm font-medium text-[#c2c0d0] transition-colors hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 md:flex">
          {isAuthenticated ? (
            <Link
              href="/app"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#6d4aff] px-4 text-sm font-medium text-white shadow-xs transition-colors hover:bg-[#5b3be0]"
            >
              Open Workspace
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-medium text-[#d4d2e0] transition-colors hover:bg-white/10 hover:text-white"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#6d4aff] px-4 text-sm font-medium text-white shadow-xs transition-colors hover:bg-[#5b3be0]"
              >
                Get Started
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-[#d4d2e0] hover:bg-white/10 hover:text-white md:hidden"
        >
          {mobileOpen ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Menu className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/10 bg-[#16151c] px-4 py-4 md:hidden">
          <nav aria-label="Mobile landing navigation" className="space-y-1">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-[#d4d2e0] hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
            {isAuthenticated ? (
              <Link
                href="/app"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#6d4aff] px-4 text-sm font-medium text-white hover:bg-[#5b3be0]"
              >
                Open Workspace
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-white/15 px-4 text-sm font-medium text-white hover:bg-white/10"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#6d4aff] px-4 text-sm font-medium text-white hover:bg-[#5b3be0]"
                >
                  Get Started Free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
