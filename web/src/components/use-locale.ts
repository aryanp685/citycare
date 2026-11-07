"use client";
import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, translate, type MessageKey, type Namespace } from "@/lib/i18n";
import { browserLocale, selectBrowserLocale, subscribeLocale } from "@/lib/locale-preference";

/** Reusable client hook. The preference affects presentation only. */
export function useLocale() {
  const locale = useSyncExternalStore(subscribeLocale, browserLocale, () => DEFAULT_LOCALE);
  return {
    locale,
    setLocale: selectBrowserLocale,
    t: <N extends Namespace>(namespace: N, key: MessageKey<N>) => translate(locale, namespace, key),
  };
}
