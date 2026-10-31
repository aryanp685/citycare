"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Landing hero. Server renders the final markup (SEO + no-JS + e2e), GSAP adds the entrance
 * (`gsap.from`) and a gentle parallax on the background blobs. `gsap.matchMedia` gives
 * reduced-motion users a static page for free.
 */
export function LandingHero({ signedIn, home, children }: { signedIn: boolean; home: string; children?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const headline = "One health record. Every doctor in the city.";

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.from(".eyebrow", { y: 12, autoAlpha: 0, duration: 0.5 })
          .from(".display .w", { y: 28, autoAlpha: 0, duration: 0.7, stagger: 0.045 }, "-=0.25")
          .from(".hero-sub", { y: 14, autoAlpha: 0, duration: 0.55 }, "-=0.35")
          .from(".hero-cta > *", { y: 10, autoAlpha: 0, duration: 0.45, stagger: 0.08 }, "-=0.3")
          .from(".hero-visual", { y: 24, autoAlpha: 0, scale: 0.98, duration: 0.8 }, "-=0.5");

        gsap.to(".blob-1", { y: -30, x: 20, duration: 9, yoyo: true, repeat: -1, ease: "sine.inOut" });
        gsap.to(".blob-2", { y: 24, x: -16, duration: 11, yoyo: true, repeat: -1, ease: "sine.inOut" });
        gsap.to(".hero-bg", {
          yPercent: 12, ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });
      }, root);
      return () => ctx.revert();
    });
    return () => mm.revert();
  }, []);

  return (
    <div ref={root} className="relative">
      <div className="hero-bg">
        <div className="hero-grid" />
        <div className="blob blob-1" />
        <div className="blob blob-2" />
      </div>

      <section className="max-w-6xl mx-auto px-4 pt-12 pb-16 md:pt-20 md:pb-24 grid lg:grid-cols-[1.1fr_.9fr] gap-10 items-center">
        <div>
          <span className="eyebrow"><span className="eyebrow-dot" /> Patient-owned · consent-gated · audit-chained</span>
          <h1 className="display mt-5 max-w-2xl" aria-label={`${headline} You hold the key.`}>
            {headline.split(" ").map((w, i) => (
              <span key={i} className="w" aria-hidden="true">{w}&nbsp;</span>
            ))}
            <span className="w gradient-text" aria-hidden="true">You hold the key.</span>
          </h1>
          <p className="hero-sub text-lg text-muted mt-5 max-w-xl leading-relaxed">
            Book without the phone call. Keep every prescription, report and visit in one timeline.
            Share it with a doctor only when you want — and see exactly who looked, and when.
          </p>
          <div className="hero-cta mt-7 flex flex-wrap gap-3">
            {signedIn ? (
              <Link className="btn btn-primary btn-lg" href={home}>Open my dashboard →</Link>
            ) : (
              <>
                <Link className="btn btn-primary btn-lg" href="/signup">Create your record</Link>
                <Link className="btn btn-ghost btn-lg" href="/login">Sign in · try the demo</Link>
              </>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">No real patient data. Synthetic demo accounts only — by design.</p>
        </div>

        <div className="hero-visual">{children}</div>
      </section>
    </div>
  );
}

/** Count-up numbers: reads data-count, animates once on view. Numbers stay in the DOM server-side. */
export function CountUp({ value, suffix = "", label }: { value: number; suffix?: string; label: string }) {
  const el = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const obj = { n: 0 };
      const tween = gsap.to(obj, {
        n: value, duration: 1.4, ease: "power2.out",
        scrollTrigger: { trigger: el.current, start: "top 90%", once: true },
        onUpdate: () => { if (el.current) el.current.textContent = Math.round(obj.n).toLocaleString("en-IN") + suffix; },
      });
      return () => tween.kill();
    });
    return () => mm.revert();
  }, [value, suffix]);
  return (
    <div>
      <span ref={el} className="stat text-brand">{value.toLocaleString("en-IN")}{suffix}</span>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted mt-1">{label}</div>
    </div>
  );
}
