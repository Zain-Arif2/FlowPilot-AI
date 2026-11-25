"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { UserSchema, type User } from "@flowpilot/shared";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { apiRequest, getErrorMessage } from "../../lib/api.js";
import { FlowPilotLogo } from "../../components/brand/flowpilot-logo.js";
import { Button } from "../../components/ui/button.js";
import { Input, Label } from "../../components/ui/input.js";

export type AuthMode = "login" | "register";

interface AuthPanelProps {
  readonly initialMode?: AuthMode;
  readonly onAuthenticated: (user: User) => void;
  readonly routeLinks?: boolean;
}

export function AuthPanel({
  initialMode = "login",
  onAuthenticated,
  routeLinks = false,
}: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [touched, setTouched] = useState(false);

  const emailInvalid =
    touched && (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
  const passwordMissing = touched && mode === "login" && password.length === 0;
  const passwordTooShort =
    touched && mode === "register" && password.length < 12;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (
      !email.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      password.length === 0 ||
      (mode === "register" && password.length < 12)
    ) {
      return;
    }

    setBusy(true);
    setErrorMessage("");
    try {
      const user = await apiRequest(
        mode === "login" ? "/auth/login" : "/auth/register",
        UserSchema,
        { method: "POST", body: { email: email.trim(), password } },
      );
      onAuthenticated(user);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen w-full bg-white lg:grid-cols-2">
      {/* Left Side: Brand & Product Showcase (Desktop) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#121118] bg-[radial-gradient(ellipse_at_top_left,rgba(109,74,255,0.22),transparent_60%)] p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="FlowPilot AI home">
            <FlowPilotLogo variant="dark" size="md" />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#c8c5d8]">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#8c6eff] motion-safe:animate-pulse"
              aria-hidden="true"
            />
            AI Workflow Studio
          </span>
        </div>

        <div className="my-auto max-w-lg space-y-8 py-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-white xl:text-4xl xl:leading-[1.15]">
              Your workflows. Smarter with AI.
            </h1>
            <p className="text-sm leading-relaxed text-[#b5b3c4] xl:text-base">
              Describe your document automation task in plain English, customize
              the generated workflow visually, and execute with human-in-the-loop
              approvals.
            </p>
          </div>

          {/* Compact Connected Workflow Preview */}
          <div className="rounded-2xl border border-white/10 bg-[#1a1822]/90 p-5 shadow-[0_20px_60px_rgb(0_0_0/0.4)]">
            <div className="mb-4 flex items-center justify-between text-xs">
              <span className="font-medium text-[#d4d2e0]">
                Document Summary Pipeline
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Validated
              </span>
            </div>

            <div className="flex flex-col items-center gap-2.5">
              <div className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#121118] px-3.5 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9b99ab]">
                    Extract document
                  </p>
                  <p className="truncate text-xs font-medium text-white">
                    PDF, DOCX, or TXT source
                  </p>
                </div>
              </div>

              <ArrowDown className="h-3.5 w-3.5 text-[#7c7992]" aria-hidden="true" />

              <div className="flex w-full items-center gap-3 rounded-xl border border-[#6d4aff]/60 bg-[#6d4aff]/12 px-3.5 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6d4aff] text-white">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#c8b9ff]">
                    Analyze with AI
                  </p>
                  <p className="truncate text-xs font-medium text-white">
                    Summary, key dates &amp; action items
                  </p>
                </div>
              </div>

              <ArrowDown className="h-3.5 w-3.5 text-[#7c7992]" aria-hidden="true" />

              <div className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#121118] px-3.5 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                  <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9b99ab]">
                    Create report
                  </p>
                  <p className="truncate text-xs font-medium text-white">
                    Structured workspace report
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#9b99ab]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#a58fff]" aria-hidden="true" />
          <span>
            Private workspace isolation with HttpOnly cookie authentication.
          </span>
        </div>
      </aside>

      {/* Right Side: Authentication Form */}
      <div className="flex min-h-screen flex-col justify-between bg-[#f8f8fa] px-4 py-6 sm:px-8 lg:bg-white lg:px-12">
        {/* Compact Mobile / Tablet Header */}
        <header className="flex items-center justify-between lg:justify-end">
          <Link href="/" aria-label="FlowPilot AI home" className="lg:hidden">
            <FlowPilotLogo variant="light" size="md" />
          </Link>
          <Link
            href="/"
            className="text-xs font-medium text-[#5e5d6e] transition-colors hover:text-[#18181f]"
          >
            Back to home
          </Link>
        </header>

        <main className="mx-auto my-auto w-full max-w-[400px] py-8">
          <div className="rounded-2xl border border-[#e6e6ee] bg-white p-6 shadow-[0_12px_36px_rgb(20_18_32/0.05)] sm:p-8 lg:border-0 lg:p-0 lg:shadow-none">
            <div className="mb-7">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6d4aff]">
                {mode === "login" ? "Sign in" : "Get started"}
              </p>
              <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#18181f]">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-1.5 text-sm text-[#5e5d6e]">
                {mode === "login"
                  ? "Sign in to access your private workspaces and workflows."
                  : "Create an account to build and run AI document workflows."}
              </p>
            </div>

            <form className="space-y-4" onSubmit={submit} noValidate>
              <div>
                <Label htmlFor="auth-email" className="mb-1.5">
                  Email address
                </Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#7b7a89]"
                    aria-hidden="true"
                  />
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    className="pl-9"
                    aria-invalid={emailInvalid}
                    aria-describedby={emailInvalid ? "auth-email-error" : undefined}
                  />
                </div>
                {emailInvalid ? (
                  <p id="auth-email-error" className="mt-1 text-xs text-rose-600">
                    Enter a valid email address.
                  </p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="auth-password" className="mb-1.5">
                  Password
                </Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#7b7a89]"
                    aria-hidden="true"
                  />
                  <Input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "register" ? 12 : undefined}
                    maxLength={128}
                    required
                    placeholder={
                      mode === "register"
                        ? "At least 12 characters"
                        : "Enter your password"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    className="pl-9 pr-10"
                    aria-invalid={passwordMissing || passwordTooShort}
                    aria-describedby="auth-password-hint"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-2 rounded-md p-1 text-[#686876] transition-colors hover:bg-[#f2f1f7] hover:text-[#18181f]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {mode === "register" ? (
                  <p
                    id="auth-password-hint"
                    className={`mt-1 text-xs ${
                      passwordTooShort ? "text-rose-600" : "text-[#5e5d6e]"
                    }`}
                  >
                    Use at least 12 characters for a strong password.
                  </p>
                ) : passwordMissing ? (
                  <p id="auth-password-hint" className="mt-1 text-xs text-rose-600">
                    Enter your password.
                  </p>
                ) : (
                  <span id="auth-password-hint" className="sr-only">
                    Enter your account password.
                  </span>
                )}
              </div>

              {errorMessage ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={busy}
              >
                {busy
                  ? mode === "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
                {!busy ? (
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                ) : null}
              </Button>
            </form>

            <div className="mt-6 border-t border-[#efeff4] pt-5 text-center text-sm text-[#5e5d6e]">
              {routeLinks ? (
                mode === "login" ? (
                  <span>
                    New to FlowPilot?{" "}
                    <Link
                      href="/signup"
                      className="font-semibold text-[#6d4aff] hover:text-[#5b3be0]"
                    >
                      Create an account
                    </Link>
                  </span>
                ) : (
                  <span>
                    Already have an account?{" "}
                    <Link
                      href="/login"
                      className="font-semibold text-[#6d4aff] hover:text-[#5b3be0]"
                    >
                      Sign in
                    </Link>
                  </span>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setErrorMessage("");
                    setTouched(false);
                  }}
                  className="font-semibold text-[#6d4aff] hover:text-[#5b3be0]"
                >
                  {mode === "login"
                    ? "New to FlowPilot? Create an account"
                    : "Already have an account? Sign in"}
                </button>
              )}
            </div>
          </div>
        </main>

        <footer className="text-center text-xs text-[#686876] lg:text-left">
          Protected by encrypted HttpOnly cookies.
        </footer>
      </div>
    </div>
  );
}
