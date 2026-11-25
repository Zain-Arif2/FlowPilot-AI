"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserSchema, type User } from "@flowpilot/shared";
import { WorkspacePanel } from "../../features/workspaces/workspace-panel.js";
import { ApiRequestError, apiRequest, getErrorMessage } from "../../lib/api.js";
import { Skeleton } from "../../components/ui/skeleton.js";
import { Button } from "../../components/ui/button.js";

export default function AppPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/auth/me", UserSchema)
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          router.replace("/login");
          return;
        }
        setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setCheckingAuth(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (checkingAuth) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#f8f8fa] p-6"
        role="status"
        aria-label="Loading workspace"
      >
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#e6e6ee] bg-white p-8 shadow-sm">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f8fa] p-6">
        <div
          role="alert"
          className="w-full max-w-md space-y-4 rounded-2xl border border-rose-200 bg-white p-6 text-sm text-rose-800 shadow-sm"
        >
          <p className="font-semibold">Unable to verify your authentication</p>
          <p className="text-rose-700">{errorMessage}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.replace("/login")}>
              Go to login
            </Button>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <WorkspacePanel
      user={user}
      onLogout={() => {
        setUser(null);
        router.replace("/login");
      }}
    />
  );
}

