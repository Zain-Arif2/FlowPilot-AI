"use client";

import { useState, type ReactNode } from "react";
import type { User, Workspace } from "@flowpilot/shared";
import {
  CheckSquare,
  ChevronDown,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils.js";
import { FlowPilotLogo } from "../brand/flowpilot-logo.js";
import { Skeleton } from "../ui/skeleton.js";

export type AppView =
  | "overview"
  | "builder"
  | "documents"
  | "history"
  | "approvals"
  | "settings";

interface NavItem {
  readonly id: AppView;
  readonly label: string;
  readonly icon: typeof LayoutDashboard;
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "builder", label: "Workflow Builder", icon: Workflow },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "history", label: "Workflow History", icon: History },
  { id: "approvals", label: "Approval Center", icon: CheckSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

interface AppShellProps {
  readonly user: User;
  readonly workspaces: readonly Workspace[];
  readonly selectedWorkspace: Workspace | null;
  readonly loadingWorkspaces: boolean;
  readonly activeView: AppView;
  readonly pendingApprovalsCount: number;
  readonly onSelectView: (view: AppView) => void;
  readonly onSelectWorkspace: (workspaceId: string) => void;
  readonly onOpenCreateWorkspace: () => void;
  readonly onLogout: () => void;
  readonly children: ReactNode;
}

export function AppShell({
  user,
  workspaces,
  selectedWorkspace,
  loadingWorkspaces,
  activeView,
  pendingApprovalsCount,
  onSelectView,
  onSelectWorkspace,
  onOpenCreateWorkspace,
  onLogout,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeNav = NAV_ITEMS.find((item) => item.id === activeView);

  function handleNavigate(view: AppView) {
    onSelectView(view);
    setMobileMenuOpen(false);
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#16151c] text-[#f4f4f7]">
      {/* Brand Header */}
      <div className="flex h-14 items-center justify-between border-b border-[#252330] px-4">
        <button
          type="button"
          onClick={() => handleNavigate("overview")}
          className="flex items-center text-left focus-visible:outline-none"
          aria-label="FlowPilot AI home"
        >
          <FlowPilotLogo variant="dark" size="md" />
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-lg p-1.5 text-[#9b99ab] hover:bg-[#211f2a] hover:text-white lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Workspace Switcher */}
      <div className="border-b border-[#252330] p-3.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8a889a]">
            Workspace
          </span>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenCreateWorkspace();
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#a58fff] hover:bg-[#211f2a] hover:text-white"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            New
          </button>
        </div>

        {loadingWorkspaces ? (
          <Skeleton className="h-9 w-full bg-[#24222e]" />
        ) : workspaces.length > 0 ? (
          <div className="relative">
            <select
              aria-label="Select workspace"
              value={selectedWorkspace?.id ?? ""}
              onChange={(event) => onSelectWorkspace(event.currentTarget.value)}
              className="h-9 w-full appearance-none rounded-lg border border-[#2c2a37] bg-[#211f2a] pl-3 pr-8 text-sm font-medium text-white transition-colors hover:border-[#3d3a4b] focus:border-[#6d4aff] focus:outline-none"
            >
              {workspaces.map((workspace) => (
                <option
                  key={workspace.id}
                  value={workspace.id}
                  className="bg-[#16151c] text-white"
                >
                  {workspace.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[#8a889a]"
              aria-hidden="true"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenCreateWorkspace();
            }}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#3a3748] text-xs font-medium text-[#b5b3c4] hover:border-[#6d4aff] hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Create first workspace
          </button>
        )}
      </div>

      {/* Primary Navigation */}
      <nav
        aria-label="Primary navigation"
        className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3.5"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#6d4aff]/18 text-white shadow-[inset_2px_0_0_#8c6eff]"
                  : "text-[#a4a2b3] hover:bg-[#211f2a] hover:text-white",
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive
                      ? "text-[#a58fff]"
                      : "text-[#7d7b8d] group-hover:text-[#c7c5d4]",
                  )}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </span>
              {item.id === "approvals" && pendingApprovalsCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#6d4aff] px-1.5 text-[11px] font-semibold text-white">
                  {pendingApprovalsCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="border-t border-[#252330] p-3">
        <div className="flex items-center gap-2.5 rounded-lg p-1.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6d4aff]/25 text-xs font-semibold text-[#c1b1ff]"
            aria-hidden="true"
          >
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {user.email.split("@")[0]}
            </p>
            <p className="truncate text-[11px] text-[#8a889a]">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-1.5 text-[#8a889a] transition-colors hover:bg-[#211f2a] hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-[#f8f8fa]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-[#252330] lg:sticky lg:top-0 lg:block lg:h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div
            className="fixed inset-0 bg-[#16151c]/60 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full w-72 max-w-[85vw] shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[#e6e6ee] bg-white/95 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e6e6ee] text-[#3f3e4d] hover:bg-[#f4f3f8] lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden truncate text-[#7b7a89] sm:inline">
                {selectedWorkspace?.name ?? "Workspace"}
              </span>
              <span className="hidden text-[#c8c7d4] sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="truncate font-semibold text-[#18181f]">
                {activeNav?.label ?? "FlowPilot AI"}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e3e2ec] bg-[#fafafe] px-2.5 py-1 text-xs font-medium text-[#545363]">
              <ShieldCheck
                className="h-3.5 w-3.5 text-[#6d4aff]"
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Private workspace</span>
              <span className="sm:hidden">Private</span>
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

