"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export type Step = { title: string; body: ReactNode; proof?: string };

/** Vertical "how it works" with a scroll-scrubbed progress line; each step lights up as it crosses mid-viewport. */
export function Steps({ steps }: { steps: Step[] }) {
  const root = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.to(".step-line-fill", {
          scaleY: 1, ease: "none",
          scrollTrigger: { trigger: root.current, start: "top 60%", end: "bottom 60%", scrub: 0.4 },
        });
        gsap.utils.toArray<HTMLElement>(".step").forEach((el) => {
          ScrollTrigger.create({ trigger: el, start: "top 62%", end: "bottom 62%", toggleClass: { targets: el, className: "is-active" } });
          gsap.from(el.querySelector(".step-card"), {
            y: 18, autoAlpha: 0, duration: 0.6, ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          });
        });
      }, root);
      return () => ctx.revert();
    });
    // no-preference not matched → static list, all steps "active"
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      root.current?.querySelectorAll(".step").forEach((s) => s.classList.add("is-active"));
    }
    return () => mm.revert();
  }, []);

  return (
    <ol ref={root} className="relative grid gap-6 pl-0 list-none">
      <div className="step-line" aria-hidden="true"><div className="step-line-fill" /></div>
      {steps.map((s, i) => (
        <li key={i} className="step relative grid grid-cols-[2.3rem_1fr] gap-4 items-start">
          <div className="step-num relative z-10">{i + 1}</div>
          <div className="step-card card card-hover">
            <div className="font-bold">{s.title}</div>
            <div className="text-sm text-muted mt-1 leading-relaxed">{s.body}</div>
            {s.proof && <div className="mt-2 text-xs font-mono text-brand-ink bg-brand-soft/60 border border-brand-soft rounded-lg px-2 py-1 inline-block">{s.proof}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
