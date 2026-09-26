import { router, useLocalSearchParams } from "expo-router";
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
  useEffect(() => {
    if (value) router.setParams({ [key]: undefined } as any);
  }, [key, value]);
}
