"use client";
import { useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};

/** True when this page is rendered inside someone else's iframe (e.g. a live-preview pane). */
export function detectEmbedded(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    return true; // cross-origin parent throws on access → we are embedded
  }
}

/**
 * Browser-only facts via useSyncExternalStore: the server snapshot is the neutral
 * value, so SSR and hydration agree and no setState-in-effect is needed.
 * `embedded` is sent with login/signup so the server can pick a cookie policy
 * that actually survives a cross-site iframe (bug A20).
 */
export function useEmbedded(): { embedded: boolean; selfUrl: string } {
  const embedded = useSyncExternalStore(subscribeNoop, detectEmbedded, () => false);
  const selfUrl = useSyncExternalStore(subscribeNoop, () => window.location.href, () => "/");
  return { embedded, selfUrl };
}
