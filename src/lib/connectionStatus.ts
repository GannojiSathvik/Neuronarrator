// The status pill's "Connected" / "Reconnecting…". One failed analyze-image call can be a blip
// (a slow fallback, a dropped packet), so the pill only turns red after two failures in a row,
// and the next success turns it green again.

export const FAILURES_BEFORE_RECONNECTING = 2;

export interface ConnectionState {
  consecutiveFailures: number;
}

export type ConnectionEvent = "success" | "failure" | "reset";

export const INITIAL_CONNECTION: ConnectionState = { consecutiveFailures: 0 };

export function connectionReducer(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  switch (event) {
    case "success":
    case "reset":
      return state.consecutiveFailures === 0 ? state : INITIAL_CONNECTION;
    case "failure":
      return { consecutiveFailures: state.consecutiveFailures + 1 };
  }
}

/** Connected until FAILURES_BEFORE_RECONNECTING calls have failed in a row (none failed yet = connected). */
export const isConnected = (state: ConnectionState): boolean =>
  state.consecutiveFailures < FAILURES_BEFORE_RECONNECTING;
