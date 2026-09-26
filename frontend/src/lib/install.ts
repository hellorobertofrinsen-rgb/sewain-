// "Install app" support for the PWA. Chrome/Android/desktop fire `beforeinstallprompt`
// early during page load, so this module is imported by the root layout to catch it.
// iPhone Safari has no prompt — users add it via Share -> "Add to Home Screen".
import { Platform } from "react-native";

let deferred: any = null;
const listeners = new Set<() => void>();

if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: any) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function canPromptInstall() {
  return !!deferred;
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const choice = await deferred.userChoice.catch(() => null);
  deferred = null;
  listeners.forEach((fn) => fn());
  return choice?.outcome === "accepted";
}

export function isInstalled() {
  if (Platform.OS !== "web" || typeof window === "undefined") return true;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function isIOS() {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
