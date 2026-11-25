"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserSchema } from "@flowpilot/shared";
import { AuthPanel } from "../../features/auth/auth-panel.js";
import { apiRequest } from "../../lib/api.js";
import { Skeleton } from "../../components/ui/skeleton.js";

export default function SignupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest("/auth/me", UserSchema)
      .then(() => {
        if (active) router.replace("/app");
      })
      .catch(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f8fa] p-6">
        <div className="w-full max-w-[420px] space-y-4 rounded-2xl border border-[#e6e6ee] bg-white p-8">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <AuthPanel
      initialMode="register"
      routeLinks
      onAuthenticated={() => router.replace("/app")}
    />
  );
}
