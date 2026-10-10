import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type SyntheticEvent } from "react";
import { Loader2, Mic } from "lucide-react";
import { cn } from "@/lib/utils";


interface ControlBarProps {
  isActive: boolean;
  onStartStop: () => void;
  /** Finder's current target, set by voice ("find my keys") */
  isListening: boolean;
  isTranscribing: boolean;
  onMicStart: () => void;
  onMicEnd: () => void;
  /** Manual mode (auto-describe off): the Describe-now action */
  showDescribeNow: boolean;
  describeDisabled: boolean;
  onDescribeNow: () => void;
}

// The full-screen push-to-talk layer sits underneath; keep presses on the bar from reaching it.
const stop = (event: SyntheticEvent) => event.stopPropagation();

const pill =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-full px-3 text-[0.8125rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50";

/** Bottom-centre minimal bar: mic (hold to talk), Stop/Start video, Describe now. Modes are spoken. */
export function ControlBar({
  isActive,
  onStartStop,
  isListening,
  isTranscribing,
  onMicStart,
  onMicEnd,
  showDescribeNow,
  describeDisabled,
  onDescribeNow,
}: ControlBarProps) {
  // Whether this button started the current hold. Tracked here rather than read from
  // isListening, which turns true only once the mic opens: a quick tap must still end the hold.
  const holdingRef = useRef(false);
  const startHold = () => {
    if (holdingRef.current || !isActive) return;
    holdingRef.current = true;
    onMicStart();
  };
  const endHold = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    onMicEnd();
  };

  // Press and hold the mic like the full-screen push-to-talk. Pointer capture keeps the hold
  // alive if the finger slides off the button.
  const micDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.button > 0) return; // primary button, touch or pen only
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startHold();
  };
  const micUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    endHold();
  };
  // Keyboard: hold Space or Enter
  const micKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) startHold();
  };
  const micKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    endHold();
  };
  // Screen readers activate with a synthetic click (detail 0) and can't hold: toggle instead
  const micClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.detail !== 0 || !isActive) return;
    if (isListening) onMicEnd();
    else onMicStart();
  };

  return (
    <div
      onClick={stop}
      onTouchStart={stop}
      onTouchEnd={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onKeyDown={stop}
      onKeyUp={stop}
      className="pointer-events-auto flex max-w-full items-center justify-center gap-1 rounded-full bg-black/35 py-1 pl-1 pr-2 backdrop-blur-md"
    >
      <span className="relative inline-flex">
        {isListening && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-white/60 motion-safe:animate-ping motion-reduce:ring-4 motion-reduce:ring-white/60"
          />
        )}
        <button
          type="button"
          onPointerDown={micDown}
          onPointerUp={micUp}
          onPointerCancel={micUp}
          onBlur={endHold}
          onKeyDown={micKeyDown}
          onKeyUp={micKeyUp}
          onClick={micClick}
          onContextMenu={(event) => event.preventDefault()}
          disabled={!isActive}
          aria-pressed={isActive ? isListening : undefined}
          aria-label={
            isListening
              ? "Listening. Release to send the command"
              : isTranscribing
              ? "Understanding your command"
              : "Hold to speak a command"
          }
          style={{ touchAction: "none" }}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50",
            isListening && "bg-ios-blue text-white",
          )}
        >
          {isTranscribing ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : <Mic aria-hidden="true" className="h-4 w-4" />}
        </button>
      </span>

      <button
        type="button"
        onClick={onStartStop}
        className={cn(pill, "text-white/90 hover:bg-white/10")}
        aria-label={isActive ? "Stop camera and narration" : "Start camera and narration"}
      >
        {isActive ? "Stop Video" : "Start Video"}
      </button>

      {showDescribeNow && (
        <button
          type="button"
          onClick={onDescribeNow}
          disabled={describeDisabled}
          className={cn(pill, "font-semibold text-white hover:bg-white/10")}
          aria-label="Describe now: describe what is in front of me"
        >
          Describe now
        </button>
      )}

    </div>
  );
}
