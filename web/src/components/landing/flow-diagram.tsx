"use client";
import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

/**
 * The product in one picture: a request travels Doctor → Patient, a grant travels back,
 * and every hop lands in the ledger. Pure SVG + GSAP (MotionPathPlugin is part of the free
 * GSAP core since 3.13). Static and fully legible when JS is off or motion is reduced.
 */
export function FlowDiagram() {
  const root = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    gsap.registerPlugin(MotionPathPlugin);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8, defaults: { ease: "power1.inOut" } });
        tl.set([".dot-req", ".dot-grant", ".dot-log"], { autoAlpha: 0 })
          .to(".dot-req", { autoAlpha: 1, duration: 0.2 })
          .to(".dot-req", { motionPath: { path: "#p-req", align: "#p-req", alignOrigin: [0.5, 0.5] }, duration: 1.4 })
          .to(".node-patient", { scale: 1.06, transformOrigin: "50% 50%", duration: 0.25, yoyo: true, repeat: 1 }, "-=0.1")
          .to(".dot-req", { autoAlpha: 0, duration: 0.2 })
          .to(".dot-grant", { autoAlpha: 1, duration: 0.2 })
          .to(".dot-grant", { motionPath: { path: "#p-grant", align: "#p-grant", alignOrigin: [0.5, 0.5] }, duration: 1.4 })
          .to(".node-doctor", { scale: 1.06, transformOrigin: "50% 50%", duration: 0.25, yoyo: true, repeat: 1 }, "-=0.1")
          .to(".dot-grant", { autoAlpha: 0, duration: 0.2 })
          .to(".dot-log", { autoAlpha: 1, duration: 0.15 })
          .to(".dot-log", { motionPath: { path: "#p-log", align: "#p-log", alignOrigin: [0.5, 0.5] }, duration: 1.0 })
          .to(".ledger-row", { fill: "#0f766e", duration: 0.2, stagger: 0.12 }, "-=0.2")
          .to(".dot-log", { autoAlpha: 0, duration: 0.15 })
          .to(".ledger-row", { fill: "#ccfbf1", duration: 0.4 }, "+=0.6");
      }, root);
      return () => ctx.revert();
    });
    return () => mm.revert();
  }, []);

  return (
    <svg ref={root} viewBox="0 0 520 320" role="img" aria-labelledby="flow-title flow-desc" className="w-full h-auto">
      <title id="flow-title">How a CityCare consent works</title>
      <desc id="flow-desc">The doctor requests access, the patient grants a scoped, expiring consent, and every step is appended to the audit ledger.</desc>
      <defs>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0f766e" floodOpacity=".12" /></filter>
      </defs>

      {/* connectors */}
      <path id="p-req" d="M150 96 C 230 40, 290 40, 370 96" fill="none" stroke="#cfd9de" strokeWidth="2" strokeDasharray="4 6" />
      <path id="p-grant" d="M370 128 C 290 184, 230 184, 150 128" fill="none" stroke="#cfd9de" strokeWidth="2" strokeDasharray="4 6" />
      <path id="p-log" d="M260 112 C 260 170, 260 200, 260 232" fill="none" stroke="#cfd9de" strokeWidth="2" strokeDasharray="4 6" />

      {/* doctor */}
      <g className="node-doctor" filter="url(#soft)">
        <rect x="26" y="70" width="124" height="84" rx="16" fill="#fff" stroke="#e1e8ec" />
        <circle cx="60" cy="100" r="13" fill="#ccfbf1" /><text x="60" y="105" textAnchor="middle" fontSize="13" fontWeight="700" fill="#134e4a">Dr</text>
        <text x="84" y="98" fontSize="13" fontWeight="700" fill="#12222b">Doctor</text>
        <text x="84" y="116" fontSize="10.5" fill="#5c6b76">asks: last 5 visits</text>
        <text x="84" y="131" fontSize="10.5" fill="#5c6b76">for 7 days</text>
      </g>

      {/* patient */}
      <g className="node-patient" filter="url(#soft)">
        <rect x="370" y="70" width="124" height="84" rx="16" fill="#fff" stroke="#e1e8ec" />
        <circle cx="404" cy="100" r="13" fill="#fde68a" /><text x="404" y="105" textAnchor="middle" fontSize="13" fontWeight="700" fill="#78350f">R</text>
        <text x="428" y="98" fontSize="13" fontWeight="700" fill="#12222b">Patient</text>
        <text x="428" y="116" fontSize="10.5" fill="#5c6b76">Allow · Deny</text>
        <text x="428" y="131" fontSize="10.5" fill="#15803d" fontWeight="700">✓ granted</text>
      </g>

      {/* ledger */}
      <g filter="url(#soft)">
        <rect x="170" y="232" width="180" height="72" rx="14" fill="#fff" stroke="#e1e8ec" />
        <text x="184" y="252" fontSize="11" fontWeight="700" fill="#12222b">Audit ledger</text>
        <text x="300" y="252" fontSize="9.5" fill="#5c6b76">hash-chained</text>
        <rect className="ledger-row" x="184" y="262" width="152" height="8" rx="4" fill="#ccfbf1" />
        <rect className="ledger-row" x="184" y="276" width="120" height="8" rx="4" fill="#ccfbf1" />
        <rect className="ledger-row" x="184" y="290" width="136" height="8" rx="4" fill="#ccfbf1" />
      </g>

      {/* travelling dots */}
      <circle className="dot-req" r="6" fill="#0f766e" />
      <circle className="dot-grant" r="6" fill="#15803d" />
      <circle className="dot-log" r="5" fill="#f59e0b" />

      {/* labels */}
      <text x="260" y="52" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0f766e">access request</text>
      <text x="260" y="192" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#15803d">scoped, expiring grant</text>
    </svg>
  );
}
