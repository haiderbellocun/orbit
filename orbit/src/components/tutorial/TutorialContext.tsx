import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { View } from "@/src/types";
import {
  clearTutorialSession,
  getTutorialUserEmail,
  isTutorialEnabled,
  markTutorialShownThisSession,
  setTutorialEnabled as persistTutorialEnabled,
} from "@/src/lib/tutorialStorage";
import {
  filterTutorialSteps,
  type TutorialStep,
} from "@/src/components/tutorial/tutorialSteps";

type TutorialContextValue = {
  enabled: boolean;
  active: boolean;
  stepIndex: number;
  steps: TutorialStep[];
  currentStep: TutorialStep | null;
  setEnabled: (enabled: boolean) => void;
  startTour: (opts?: { force?: boolean }) => void;
  stopTour: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

type TutorialProviderProps = {
  children: React.ReactNode;
  view: View;
  setView: (v: View) => void;
  capabilities: readonly string[];
  setSidebarOpen?: (open: boolean) => void;
};

export function TutorialProvider({
  children,
  view,
  setView,
  capabilities,
  setSidebarOpen,
}: TutorialProviderProps) {
  const [enabled, setEnabledState] = useState(() => isTutorialEnabled());
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const didAutoStartRef = useRef(false);
  const viewRef = useRef(view);
  const capsRef = useRef(capabilities);
  const setViewRef = useRef(setView);
  const setSidebarOpenRef = useRef(setSidebarOpen);

  viewRef.current = view;
  capsRef.current = capabilities;
  setViewRef.current = setView;
  setSidebarOpenRef.current = setSidebarOpen;

  const steps = useMemo(
    () => filterTutorialSteps(capabilities),
    [capabilities]
  );

  const currentStep = active && steps[stepIndex] ? steps[stepIndex] : null;

  const stopTour = useCallback(() => {
    setActive(false);
    markTutorialShownThisSession();
  }, []);

  const startTour = useCallback((opts?: { force?: boolean }) => {
    const filtered = filterTutorialSteps(capsRef.current);
    if (filtered.length === 0) return;
    // `force` is reserved for toggle/manual restart; auto-start always runs once per mount.
    void opts;
    setStepIndex(0);
    setActive(true);
    markTutorialShownThisSession();
    const first = filtered[0];
    if (first.view !== viewRef.current) {
      setViewRef.current(first.view);
    }
    if (first.sidebarTarget) {
      setSidebarOpenRef.current?.(true);
    } else {
      setSidebarOpenRef.current?.(false);
    }
  }, []);

  const setEnabled = useCallback(
    (next: boolean) => {
      persistTutorialEnabled(next);
      setEnabledState(next);
      if (!next) {
        stopTour();
        return;
      }
      clearTutorialSession();
      didAutoStartRef.current = true;
      startTour({ force: true });
    },
    [startTour, stopTour]
  );

  const goToStep = useCallback(
    (index: number) => {
      const upcoming = steps[index];
      if (!upcoming) return;
      if (upcoming.view !== viewRef.current) {
        setViewRef.current(upcoming.view);
      }
      if (upcoming.sidebarTarget) {
        setSidebarOpenRef.current?.(true);
      } else {
        setSidebarOpenRef.current?.(false);
      }
      setStepIndex(index);
    },
    [steps]
  );

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      setActive(false);
      markTutorialShownThisSession();
      return;
    }
    goToStep(stepIndex + 1);
  }, [goToStep, stepIndex, steps.length]);

  const prev = useCallback(() => {
    if (stepIndex <= 0) return;
    goToStep(stepIndex - 1);
  }, [goToStep, stepIndex]);

  const skip = useCallback(() => {
    stopTour();
  }, [stopTour]);

  // Sync enabled when user email becomes available (post-login).
  useEffect(() => {
    const email = getTutorialUserEmail();
    if (email) {
      setEnabledState(isTutorialEnabled(email));
    }
  }, [capabilities]);

  // Auto-start once when the authenticated shell mounts (login / reload).
  // No deferred timer: a previous setTimeout was cleared by effect cleanup
  // when state updated, so the tour never opened on entry. GuidedTour waits for DOM.
  useEffect(() => {
    if (didAutoStartRef.current) return;
    if (capabilities.length === 0) return;
    if (!isTutorialEnabled()) return;

    didAutoStartRef.current = true;
    clearTutorialSession();
    startTour({ force: true });
  }, [capabilities.length, startTour]);

  // Keep spotlight view/sidebar in sync with the current step.
  useEffect(() => {
    if (!active || !currentStep) return;
    if (currentStep.view !== view) {
      setView(currentStep.view);
    }
    if (currentStep.sidebarTarget) {
      setSidebarOpen?.(true);
    } else {
      setSidebarOpen?.(false);
    }
  }, [active, currentStep, setSidebarOpen, setView, view]);

  const value = useMemo<TutorialContextValue>(
    () => ({
      enabled,
      active,
      stepIndex,
      steps,
      currentStep,
      setEnabled,
      startTour,
      stopTour,
      next,
      prev,
      skip,
    }),
    [
      enabled,
      active,
      stepIndex,
      steps,
      currentStep,
      setEnabled,
      startTour,
      stopTour,
      next,
      prev,
      skip,
    ]
  );

  return (
    <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
  );
}

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error("useTutorial must be used within TutorialProvider");
  }
  return ctx;
}

/** Safe hook for components that may render outside the provider (e.g. login). */
export function useTutorialOptional(): TutorialContextValue | null {
  return useContext(TutorialContext);
}
