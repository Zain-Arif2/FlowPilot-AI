import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  Lock,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Workflow,
} from "lucide-react";
import { FlowPilotLogo } from "../../components/brand/flowpilot-logo.js";
import { Badge } from "../../components/ui/badge.js";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.js";
import { LandingFaq } from "./landing-faq.js";

const STEPS = [
  {
    number: "01",
    title: "Describe your task",
    description:
      "Write what you want to accomplish in plain English and optionally select an uploaded PDF, DOCX, or TXT document as context.",
  },
  {
    number: "02",
    title: "Generate and customize your workflow",
    description:
      "FlowPilot AI generates a schema-validated DAG. Open it in the React Flow builder to add, remove, or branch steps visually.",
  },
  {
    number: "03",
    title: "Review and execute it",
    description:
      "Run your workflow against any ready document, monitor step-by-step execution, and approve sensitive report updates before they apply.",
  },
] as const;

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI-Powered Workflow Generation",
    description:
      "Turn natural-language prompts into validated workflow definitions using structured JSON Schema output.",
  },
  {
    icon: Workflow,
    title: "Visual Workflow Builder",
    description:
      "Drag-and-drop React Flow editor with typed action nodes, true/false condition branches, and a live side-panel inspector.",
  },
  {
    icon: FileText,
    title: "Document Processing",
    description:
      "Upload PDF (up to 100 pages), DOCX, and UTF-8 TXT files up to 4 MB for bounded text extraction and AI analysis.",
  },
  {
    icon: Activity,
    title: "Execution Monitoring",
    description:
      "Inspect run status, per-step attempt history, and content-free audit events in Workflow History and Execution Details.",
  },
  {
    icon: CheckSquare,
    title: "Human Approval",
    description:
      "Replacing an existing report pauses automatically in the Approval Center so the workspace owner can review proposed changes first.",
  },
  {
    icon: RefreshCw,
    title: "Reliable Workflow Execution",
    description:
      "Persisted step state, idempotent run creation, optimistic revision checks, and safe retries for transient step failures.",
  },
] as const;

const PILLARS = [
  {
    icon: UserCheck,
    title: "You stay in control",
    description:
      "AI proposes the workflow graph, never executes arbitrary code. Every step uses a fixed, server-validated action registry.",
  },
  {
    icon: ShieldCheck,
    title: "Approval before sensitive changes",
    description:
      "Creating a new report runs smoothly, while replacing an existing report pauses for your explicit approve or reject decision.",
  },
  {
    icon: Lock,
    title: "Strict workspace isolation",
    description:
      "Workspaces are private to their creator, with owner-scoped access checks across documents, workflows, runs, and reports.",
  },
  {
    icon: CheckCircle2,
    title: "Predictable, durable runs",
    description:
      "Completed steps are never repeated during safe retries, and stale workflow or report revisions are rejected cleanly.",
  },
] as const;

export function LandingSections() {
  return (
    <>
      {/* How It Works */}
      <section
        id="how-it-works"
        className="border-b border-[#e6e6ee] bg-white py-16 sm:py-24"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b3be0]">
              How it works
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#18181f] sm:text-4xl">
              From plain English to repeatable execution
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#5e5d6e] sm:text-base">
              Three focused steps to turn unstructured documents into structured
              reports.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <Card
                key={step.number}
                className="relative overflow-hidden border-[#e6e6ee] bg-[#fafafe] p-6 transition-shadow hover:shadow-md"
              >
                <span className="inline-flex h-8 items-center rounded-lg bg-[#f2effc] px-2.5 font-mono text-xs font-semibold text-[#5b3be0]">
                  Step {step.number}
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-[#18181f]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5e5d6e]">
                  {step.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-[#f8f8fa] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b3be0]">
              Capabilities
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#18181f] sm:text-4xl">
              Built for practical AI automation
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#5e5d6e] sm:text-base">
              Every capability in FlowPilot AI is designed for clarity,
              validation, and owner control.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.title}
                  className="border-[#e6e6ee] bg-white transition-shadow hover:border-[#d2cef0] hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2effc] text-[#6d4aff]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-[#5e5d6e]">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Product Showcase */}
      <section className="border-y border-[#e6e6ee] bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b3be0]">
              Product showcase
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#18181f] sm:text-4xl">
              A focused workspace for your workflows
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#5e5d6e] sm:text-base">
              Dark charcoal navigation, spacious React Flow canvas, and clear
              execution visibility.
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-[#dcdbe6] bg-[#f8f8fa] shadow-[0_20px_60px_rgb(20_18_32/0.08)]">
            <div className="grid lg:grid-cols-[220px_1fr]">
              <div className="hidden flex-col justify-between bg-[#16151c] p-4 text-white lg:flex">
                <div className="space-y-4">
                  <FlowPilotLogo variant="dark" size="sm" />

                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[#b5b3c4]">
                      <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
                      Dashboard
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-[#6d4aff]/20 px-2.5 py-2 font-medium text-white shadow-[inset_2px_0_0_#8c6eff]">
                      <Workflow className="h-3.5 w-3.5 text-[#b7a5ff]" aria-hidden="true" />
                      Workflow Builder
                    </div>
                    <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[#b5b3c4]">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      Documents
                    </div>
                    <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[#b5b3c4]">
                      <History className="h-3.5 w-3.5" aria-hidden="true" />
                      Workflow History
                    </div>
                    <div className="flex items-center justify-between rounded-lg px-2.5 py-2 text-[#b5b3c4]">
                      <span className="flex items-center gap-2">
                        <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        Approvals
                      </span>
                      <span className="rounded-full bg-[#6d4aff] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        1
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#2c2a37] bg-[#211f2a] px-3 py-2 text-[11px] text-[#c2c0d0]">
                  Private Workspace
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e6e6ee] bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#18181f]">
                      Contract Summary Pipeline
                    </span>
                    <Badge variant="purple">Rev 2</Badge>
                    <Badge variant="success">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      Valid
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e2e2ea] bg-white px-3 text-xs font-medium text-[#22212c]">
                      <Sparkles className="h-3.5 w-3.5 text-[#6d4aff]" aria-hidden="true" />
                      AI Generate
                    </span>
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#6d4aff] px-3 text-xs font-medium text-white">
                      <Play className="h-3 w-3" aria-hidden="true" />
                      Run
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_240px]">
                  <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-[#e6e6ee] bg-white p-5">
                    <div className="flex w-full max-w-[230px] items-center gap-2.5 rounded-lg border border-[#e2e2ec] bg-white px-3 py-2.5 shadow-2xs">
                      <FileText className="h-4 w-4 text-sky-600" aria-hidden="true" />
                      <span className="text-xs font-medium text-[#18181f]">
                        Extract document
                      </span>
                    </div>
                    <div className="h-4 w-px bg-[#cfcfe0]" aria-hidden="true" />
                    <div className="flex w-full max-w-[230px] items-center gap-2.5 rounded-lg border border-[#6d4aff] bg-[#faf8ff] px-3 py-2.5">
                      <Sparkles className="h-4 w-4 text-[#6d4aff]" aria-hidden="true" />
                      <span className="text-xs font-medium text-[#18181f]">
                        Analyze with AI
                      </span>
                    </div>
                    <div className="h-4 w-px bg-[#cfcfe0]" aria-hidden="true" />
                    <div className="flex w-full max-w-[230px] items-center gap-2.5 rounded-lg border border-[#e2e2ec] bg-white px-3 py-2.5 shadow-2xs">
                      <GitBranch className="h-4 w-4 text-violet-600" aria-hidden="true" />
                      <span className="text-xs font-medium text-[#18181f]">
                        Condition branch
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e6e6ee] bg-white p-4">
                    <p className="text-xs font-semibold text-[#18181f]">
                      Analyze with AI
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#5e5d6e]">
                      Selected step settings
                    </p>
                    <div className="mt-3 space-y-2 text-xs text-[#383745]">
                      <div className="flex items-center gap-2 rounded-md border border-[#efeff4] bg-[#fafafe] px-2.5 py-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#6d4aff]" aria-hidden="true" />
                        Summary
                      </div>
                      <div className="flex items-center gap-2 rounded-md border border-[#efeff4] bg-[#fafafe] px-2.5 py-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#6d4aff]" aria-hidden="true" />
                        Key dates
                      </div>
                      <div className="flex items-center gap-2 rounded-md border border-[#efeff4] bg-[#fafafe] px-2.5 py-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#6d4aff]" aria-hidden="true" />
                        Action items
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why FlowPilot */}
      <section className="bg-[#121118] py-16 text-white sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#b7a5ff]">
              Why FlowPilot AI
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
              Automation with clear boundaries
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#c2c0d0] sm:text-base">
              Designed around explicit validation, private workspaces, and
              human-in-the-loop oversight.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="rounded-2xl border border-white/10 bg-[#1a1822] p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6d4aff]/20 text-[#b7a5ff]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#c2c0d0]">
                    {pillar.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-[#f8f8fa] py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b3be0]">
              FAQ
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#18181f] sm:text-4xl">
              Common questions
            </h2>
          </div>

          <LandingFaq />
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[#e6e6ee] bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-[#16151c] px-6 py-12 text-white shadow-xl sm:px-12 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-4xl">
              Build your first AI-powered workflow today
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#c2c0d0] sm:text-base">
              Create a private workspace, upload a document, and let FlowPilot
              AI generate a workflow you can inspect and run.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6d4aff] px-6 text-sm font-medium text-white transition-colors hover:bg-[#5b3be0] sm:w-auto"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 text-sm font-medium text-white transition-colors hover:bg-white/10 sm:w-auto"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#121118] py-12 text-[#b5b3c4]">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 px-4 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div className="max-w-sm space-y-2.5">
            <Link href="/" aria-label="FlowPilot AI home">
              <FlowPilotLogo variant="dark" size="sm" />
            </Link>
            <p className="text-xs leading-relaxed text-[#a8a6b8]">
              AI-powered document workflow automation with visual editing,
              execution monitoring, and human-in-the-loop approvals.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-white">
              How It Works
            </a>
            <a href="#faq" className="hover:text-white">
              FAQ
            </a>
            <Link href="/login" className="hover:text-white">
              Login
            </Link>
            <Link href="/signup" className="hover:text-white">
              Sign up
            </Link>
            <Link href="/app" className="hover:text-white">
              Workspace
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-6xl border-t border-white/10 px-4 pt-6 text-xs text-[#9b99ab] sm:px-6 lg:px-8">
          © {new Date().getFullYear()} FlowPilot AI. All rights reserved.
        </div>
      </footer>
    </>
  );
}
