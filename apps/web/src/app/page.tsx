"use client";

import { useEffect, useState } from "react";
import { UserSchema, type User } from "@flowpilot/shared";
import { AuthPanel } from "../features/auth/auth-panel.js";
import { WorkspacePanel } from "../features/workspaces/workspace-panel.js";
import { ApiRequestError, apiRequest, getErrorMessage } from "../lib/api.js";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/auth/me", UserSchema)
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (!(error instanceof ApiRequestError && error.status === 401)) {
          setErrorMessage(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="page-shell">
      <header className="brand-header">
        <a className="brand-mark" href="/" aria-label="FlowPilot AI home">
          <span className="brand-icon" aria-hidden="true">F</span>
          <span>FlowPilot <strong>AI</strong></span>
        </a>
        <span className="header-caption">Workflow automation, under your control</span>
      </header>

      <div className="main-content">
        {checkingSession ? (
          <section className="loading-card" role="status">
            Checking your secure session...
          </section>
        ) : user ? (
          <WorkspacePanel
            user={user}
            onLogout={() => {
              setUser(null);
              setErrorMessage("");
            }}
          />
        ) : (
          <>
            {errorMessage && (
              <p className="error-message page-error" role="alert">
                {errorMessage}
              </p>
            )}
            <AuthPanel onAuthenticated={setUser} />
          </>
        )}
      </div>
      <footer className="page-footer">
        Your sessions are protected with secure, HttpOnly cookies.
      </footer>
    </main>
  );
}
