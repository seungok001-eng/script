"use client";

import { Check } from "lucide-react";
import { useProject } from "./providers/ProjectProvider";
import { STEP_TITLES } from "@/lib/types";

export default function Stepper() {
  const { state, setStep } = useProject();
  const current = state.currentStep;

  return (
    <nav className="mb-8 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 sm:gap-2">
        {STEP_TITLES.map((title, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li key={n} className="flex items-center">
              <button
                onClick={() => setStep(n)}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-base-700/60"
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold transition ${
                    active
                      ? "border-accent bg-accent text-base-900 shadow-glow"
                      : done
                        ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                        : "border-base-600 bg-base-800 text-slate-500"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : n}
                </span>
                <span
                  className={`whitespace-nowrap text-xs font-medium transition ${
                    active
                      ? "text-slate-50"
                      : done
                        ? "text-slate-400"
                        : "text-slate-600 group-hover:text-slate-400"
                  }`}
                >
                  {title}
                </span>
              </button>
              {n < STEP_TITLES.length && (
                <span className="mx-0.5 h-px w-4 bg-base-600 sm:w-6" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
