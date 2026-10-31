"use client";
import { useEffect } from "react";

/**
 * D31: free-tier cold starts (Vercel function + Neon compute autosuspend) land on the FIRST
 * database request, which used to be the login click. Public pages fire one throw-away
 * /api/health call on mount so the pool and the compute are warm by the time the user submits.
 * No personal data, no state, once per page load; ignored entirely if it fails.
 */
export function Warmup() {
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    fetch("/api/health", { cache: "no-store", credentials: "omit", signal: ctrl.signal }).catch(() => null).finally(() => clearTimeout(t));
    return () => { clearTimeout(t); ctrl.abort(); };
  }, []);
  return null;
}
