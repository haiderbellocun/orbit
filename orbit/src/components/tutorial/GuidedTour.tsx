import React, { useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTutorial } from "@/src/components/tutorial/TutorialContext";
import { cn } from "@/src/lib/utils";

const PAD = 8;
const WAIT_MS = 80;
const WAIT_MAX = 40;

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(selector: string): HTMLElement | null {
  return document.querySelector(`[data-tutorial="${selector}"]`);
}

function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function cardPlacement(
  hole: Rect,
  cardW: number,
  cardH: number
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 16;

  let top = hole.top + hole.height + gap;
  let left = hole.left;

  if (top + cardH > vh - 12) {
    top = hole.top - cardH - gap;
  }
  if (top < 12) {
    top = Math.max(12, (vh - cardH) / 2);
  }
  if (left + cardW > vw - 12) {
    left = vw - cardW - 12;
  }
  if (left < 12) left = 12;

  return { top, left };
}

export const GuidedTour: React.FC = () => {
  const { active, currentStep, stepIndex, steps, next, prev, skip } =
    useTutorial();
  const [hole, setHole] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, skip]);

  useLayoutEffect(() => {
    if (!active || !currentStep) {
      setHole(null);
      setReady(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let raf = 0;

    const tick = () => {
      if (cancelled) return;
      const el = findTarget(currentStep.target);
      if (!el) {
        attempts += 1;
        if (attempts < WAIT_MAX) {
          window.setTimeout(() => {
            raf = requestAnimationFrame(tick);
          }, WAIT_MS);
        } else {
          setReady(true);
          setHole(null);
        }
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      const apply = () => {
        if (cancelled) return;
        setHole(measure(el));
        setReady(true);
      };
      // Allow scroll to settle a bit.
      window.setTimeout(apply, 120);
    };

    setReady(false);
    tick();

    const onResize = () => {
      const el = findTarget(currentStep.target);
      if (el) setHole(measure(el));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, currentStep]);

  if (!active || !currentStep) return null;

  const isLast = stepIndex >= steps.length - 1;
  const cardW = Math.min(360, window.innerWidth - 24);
  const cardH = 220;
  const place = hole
    ? cardPlacement(hole, cardW, cardH)
    : { top: window.innerHeight / 2 - 110, left: (window.innerWidth - cardW) / 2 };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[250] pointer-events-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Tutorial de Orbit"
      >
        {/* Dim overlay with spotlight hole via box-shadow on a cutout */}
        {hole ? (
          <motion.div
            key={`hole-${currentStep.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute rounded-2xl pointer-events-none"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.72)",
              outline: "2px solid rgba(168, 85, 247, 0.9)",
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/70" />
        )}

        {/* Block clicks on backdrop without advancing */}
        <div className="absolute inset-0" aria-hidden />

        {ready && (
          <motion.div
            key={`card-${currentStep.id}`}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute rounded-[12px] border border-orbit-border bg-orbit-elevated p-5 shadow-2xl shadow-slate-200/80",
              "pointer-events-auto"
            )}
            style={{
              top: place.top,
              left: place.left,
              width: cardW,
              zIndex: 1,
            }}
          >
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orbit-primary">
              Paso {stepIndex + 1} de {steps.length}
            </p>
            <h3 className="mb-2 font-display text-lg font-bold tracking-tight text-orbit-text">
              {currentStep.title}
            </h3>
            <p className="text-sm text-orbit-text-secondary leading-relaxed mb-5">
              {currentStep.body}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={prev}
                disabled={stepIndex === 0}
                className="glass-button-secondary px-3 py-2 text-xs font-bold disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={next}
                className="glass-button-primary px-3 py-2 text-xs font-bold"
              >
                {isLast ? "Listo" : "Siguiente"}
              </button>
              <button
                type="button"
                onClick={skip}
                className="ml-auto text-xs font-semibold text-orbit-muted hover:text-orbit-text px-2 py-2"
              >
                Saltar tutorial
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
};
