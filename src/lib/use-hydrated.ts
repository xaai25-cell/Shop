"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True after hydration – avoids SSR/localStorage mismatches (e.g. persisted cart). */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
