import { router, useLocalSearchParams, useNavigationContainerRef } from "expo-router";
import { useEffect, useState } from "react";

/**
 * Run `onTrigger` once when the screen is opened with ?<key>=… (e.g. the "+" menu
 * opening /units?add=1), then remove the param so a later visit can trigger again.
 */
export function useParamTrigger(key: string, onTrigger: () => void) {
  const params = useLocalSearchParams() as Record<string, string | string[] | undefined>;
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const [seen, setSeen] = useState<string | undefined>(undefined);
  if (value !== seen) {
    setSeen(value);
    if (value) onTrigger();
  }
  // On a fresh page load (/units?add=1 typed or refreshed) the navigator isn't ready
  // during the first effects, and navigating then crashes; wait until it is.
  const nav = useNavigationContainerRef();
  useEffect(() => {
    if (!value) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      if (nav.isReady()) router.setParams({ [key]: undefined } as any);
      else if (tries++ < 60) timer = setTimeout(clear, 50);
    };
    clear();
    return () => clearTimeout(timer);
  }, [key, value, nav]);
}
