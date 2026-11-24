"use client";

import { useState, type FormEvent } from "react";
import { UserSchema, type User } from "@flowpilot/shared";
import { apiRequest, getErrorMessage } from "../../lib/api.js";

type AuthMode = "login" | "register";

export function AuthPanel({
  onAuthenticated,
}: {
  readonly onAuthenticated: (user: User) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    try {
      const user = await apiRequest(
        mode === "login" ? "/auth/login" : "/auth/register",
        UserSchema,
        { method: "POST", body: { email, password } },
      );
      onAuthenticated(user);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-heading">
      <p className="eyebrow">Private workspace automation</p>
      <h1 id="auth-heading">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="muted">
        Sign in to manage your workspaces and run document workflows.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 12 : undefined}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          {mode === "register" && (
            <span className="field-note">Use at least 12 characters.</span>
          )}
        </label>
        {errorMessage && (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button
        className="text-button"
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setErrorMessage("");
        }}
      >
        {mode === "login"
          ? "New to FlowPilot? Create an account"
          : "Already have an account? Sign in"}
      </button>
    </section>
  );
}
