// Two-step confirmation for destructive actions: the first trigger only arms,
// a second trigger within the window confirms.
export const CONFIRM_WINDOW_MS = 5000;

export interface ConfirmStep {
  // True when this trigger should carry out the action
  confirmed: boolean;
  // Timestamp to store for the next trigger (null once confirmed)
  armedAt: number | null;
}

export function confirmStep(armedAt: number | null, now: number, windowMs = CONFIRM_WINDOW_MS): ConfirmStep {
  if (armedAt !== null && now - armedAt <= windowMs) {
    return { confirmed: true, armedAt: null };
  }
  // Not armed, or the previous arm expired: this trigger only arms
  return { confirmed: false, armedAt: now };
}
