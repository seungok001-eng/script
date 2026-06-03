"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Stepper from "@/components/Stepper";
import SettingsModal from "@/components/SettingsModal";
import ProjectsModal from "@/components/ProjectsModal";
import CostTracker from "@/components/CostTracker";
import RecoveryModal from "@/components/RecoveryModal";
import { useProject } from "@/components/providers/ProjectProvider";

import Step1Topic from "@/components/steps/Step1Topic";
import Step2Research from "@/components/steps/Step2Research";
import Step3Speaker from "@/components/steps/Step3Speaker";
import Step4Synopsis from "@/components/steps/Step4Synopsis";
import Step5Intro from "@/components/steps/Step5Intro";
import Step6Draft from "@/components/steps/Step6Draft";
import Step7Revise from "@/components/steps/Step7Revise";
import Step8Metadata from "@/components/steps/Step8Metadata";

const STEP_COMPONENTS = [
  Step1Topic,
  Step2Research,
  Step3Speaker,
  Step4Synopsis,
  Step5Intro,
  Step6Draft,
  Step7Revise,
  Step8Metadata,
];

export default function Page() {
  const { state, hydrated } = useProject();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  const idx = Math.min(Math.max(state.currentStep - 1, 0), STEP_COMPONENTS.length - 1);
  const CurrentStep = STEP_COMPONENTS[idx];

  return (
    <div className="min-h-screen">
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenProjects={() => setProjectsOpen(true)}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {!hydrated ? (
          <div className="flex h-[60vh] items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            불러오는 중…
          </div>
        ) : (
          <>
            <Stepper />
            <CurrentStep />
          </>
        )}
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProjectsModal open={projectsOpen} onClose={() => setProjectsOpen(false)} />
      <RecoveryModal />
      {hydrated && <CostTracker />}
    </div>
  );
}
