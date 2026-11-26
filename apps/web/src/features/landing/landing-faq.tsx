"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    question: "How does AI workflow generation work?",
    answer:
      "You describe your goal in natural language and optionally reference a ready document. FlowPilot AI generates a structured workflow graph validated against strict schemas and DAG rules before you ever save or run it.",
  },
  {
    question: "What document formats and sizes are supported?",
    answer:
      "FlowPilot AI supports English PDF (up to 100 native pages), DOCX, and UTF-8 TXT files up to 10 MB per file.",
  },
  {
    question: "Why do report replacements require human approval?",
    answer:
      "To prevent unintended overwrites, any step that replaces an existing report pauses the execution and sends the proposed content to your Approval Center. The change only commits after you explicitly approve it.",
  },
  {
    question: "Can I edit AI-generated workflows before running them?",
    answer:
      "Yes. Every generated workflow opens in the visual React Flow builder where you can add or remove steps, configure analysis sections or report titles, and wire true/false condition branches.",
  },
  {
    question: "What happens if an execution step fails?",
    answer:
      "FlowPilot records step-level status and error codes in Execution Details. Repeatable steps that fail due to transient issues can be retried safely without re-running already completed steps.",
  },
] as const;

export function LandingFaq() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="mt-10 space-y-3">
      {FAQS.map((faq, index) => {
        const isOpen = openFaq === index;
        return (
          <div
            key={faq.question}
            className="overflow-hidden rounded-xl border border-[#e6e6ee] bg-white"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenFaq(isOpen ? null : index)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-[#18181f] transition-colors hover:bg-[#fafafe] sm:text-base"
            >
              <span>{faq.question}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#5e5d6e] transition-transform duration-200 ${
                  isOpen ? "rotate-180 text-[#6d4aff]" : ""
                }`}
                aria-hidden="true"
              />
            </button>
            {isOpen ? (
              <div className="border-t border-[#efeff4] px-5 py-4 text-sm leading-relaxed text-[#5e5d6e]">
                {faq.answer}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

