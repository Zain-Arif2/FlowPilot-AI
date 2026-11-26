import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileDiff,
  FileText,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-[#121118] bg-[radial-gradient(ellipse_at_top,rgba(109,74,255,0.20),transparent_65%)] pb-20 pt-14 text-white sm:pb-28 sm:pt-20">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#6d4aff]/40 bg-[#6d4aff]/15 px-3.5 py-1 text-xs font-medium text-[#d4c8ff]">
            <Sparkles className="h-3.5 w-3.5 text-[#b7a5ff]" aria-hidden="true" />
            AI-powered document workflow automation
          </div>

          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[54px] lg:leading-[1.08]">
            Turn Ideas Into Automated Workflows with AI.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#c2c0d0] sm:text-lg">
            Describe your document task in plain English. FlowPilot AI generates
            a structured workflow graph you can inspect, customize visually,
            and execute with human-in-the-loop approvals.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6d4aff] px-6 text-sm font-medium text-white shadow-[0_6px_24px_rgb(109_74_255/0.35)] transition-colors hover:bg-[#5b3be0] sm:w-auto"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#features"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 text-sm font-medium text-[#e4e3ee] transition-colors hover:bg-white/10 sm:w-auto"
            >
              Explore Features
            </a>
          </div>
          <p className="mx-auto mt-5 max-w-2xl rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-100">
            Portfolio demo only: do not upload real, confidential, or sensitive
            documents. Use synthetic sample files only.
          </p>
        </div>

        {/* Product Preview: AI Prompt -> Visual Workflow DAG */}
        <div className="mx-auto mt-14 max-w-4xl rounded-2xl border border-white/12 bg-[#1a1822] p-3 shadow-[0_24px_80px_rgb(0_0_0/0.45)] sm:p-5">
          <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#121118] p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6d4aff]/20 text-[#b7a5ff]">
                <Wand2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="text-xs leading-relaxed text-[#d4d2e0] sm:text-sm">
                &ldquo;Extract text from the uploaded agreement, analyze summary
                and action items, then create or update the review report.&rdquo;
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300 sm:self-auto">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Validated DAG
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-[#2a2736] bg-[#f8f8fa] p-4 text-[#18181f] sm:p-6">
            <div className="flex flex-col items-center gap-3">
              <div className="w-full max-w-[260px] rounded-xl border border-[#e2e2ec] bg-white px-4 py-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-200/80 bg-sky-50 text-sky-700">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5e5d6e]">
                      Extract document
                    </p>
                    <p className="truncate text-xs font-medium text-[#18181f]">
                      PDF, DOCX, or TXT source
                    </p>
                  </div>
                </div>
              </div>

              <ArrowDown
                className="h-4 w-4 text-[#75738a]"
                aria-hidden="true"
              />

              <div className="w-full max-w-[260px] rounded-xl border border-[#6d4aff] bg-white px-4 py-3 ring-2 ring-[#6d4aff]/15 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#dfd7fa] bg-[#f2effc] text-[#6d4aff]">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5e5d6e]">
                      Analyze with AI
                    </p>
                    <p className="truncate text-xs font-medium text-[#18181f]">
                      Summary, dates &amp; action items
                    </p>
                  </div>
                </div>
              </div>

              <ArrowDown
                className="h-4 w-4 text-[#75738a]"
                aria-hidden="true"
              />

              <div className="w-full max-w-[260px] rounded-xl border border-[#e2e2ec] bg-white px-4 py-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-200/80 bg-violet-50 text-violet-700">
                    <GitBranch className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5e5d6e]">
                      Condition
                    </p>
                    <p className="truncate text-xs font-medium text-[#18181f]">
                      Has action items equals true
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-[#efeff4] pt-2 text-[11px] font-semibold">
                  <span className="text-emerald-700">True branch</span>
                  <span className="text-rose-700">False branch</span>
                </div>
              </div>

              <div className="mt-1 grid w-full max-w-[540px] gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#e2e2ec] bg-white px-4 py-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200/80 bg-emerald-50 text-emerald-700">
                      <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5e5d6e]">
                        Create report
                      </p>
                      <p className="truncate text-xs font-medium text-[#18181f]">
                        Actionable summary report
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-200/80 bg-amber-50 text-amber-800">
                      <FileDiff className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5e5d6e]">
                        Replace report
                      </p>
                      <p className="inline-flex items-center gap-1 truncate text-xs font-medium text-amber-900">
                        <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                        Pauses for owner approval
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
