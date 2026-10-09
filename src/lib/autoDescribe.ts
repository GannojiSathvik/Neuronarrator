import type { VisionMode } from "@/services/vision";

// "Auto-describe" decides whether the capture loop keeps narrating on its own. Off (the default)
// the app describes only when asked: the Describe button, "neuro describe", or a mode switch.

export const AUTO_DESCRIBE_KEY = "neuronarrator.autoDescribe";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const defaultStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** Saved setting, OFF unless the user turned it on. Storage can be blocked (private mode). */
export function readAutoDescribe(storage: Storage | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(AUTO_DESCRIBE_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeAutoDescribe(enabled: boolean, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(AUTO_DESCRIBE_KEY, enabled ? "on" : "off");
  } catch {
    /* storage unavailable: the setting just lasts for this session */
  }
}

/** Whether a finished capture should start the next one by itself. With auto-describe off, Finder
 *  still keeps scanning until the item is found — looking repeatedly is what the user asked for. */
export function shouldAutoContinue(mode: VisionMode, autoDescribe: boolean, found?: boolean): boolean {
  if (autoDescribe) return true;
  return mode === "finder" && found === false;
}
