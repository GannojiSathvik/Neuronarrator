import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type SyntheticEvent } from "react";
import { Loader2, Mic, Play, ScanEye, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommandMode } from "@/hooks/useVoiceControl";

const MODES: Array<{ mode: CommandMode; label: string; spoken: string }> = [
  { mode: "standard", label: "Describe", spoken: "Describe mode: general scene description" },
  { mode: "reader", label: "Read", spoken: "Read mode: read text aloud" },
  { mode: "currency", label: "Money", spoken: "Money mode: count currency notes" },
  { mode: "finder", label: "Find", spoken: "Find mode: look for an item" },
];

interface ControlBarProps {
  isActive: boolean;
  onStartStop: () => void;
  mode: CommandMode;
  onModeSelect: (mode: CommandMode) => void;
  /** Finder's current target, set by voice ("find my keys") */
  targetItem: string;
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
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-[1rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50";

/** Bottom-centre translucent bar: mic (hold to talk), Start/Stop, mode switch, Describe now. */
export function ControlBar({
  isActive,
  onStartStop,
  mode,
  onModeSelect,
  targetItem,
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
      className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-[2rem] border border-white/15 bg-black/45 p-2 shadow-lg backdrop-blur-xl"
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
            "relative flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50",
            isListening && "bg-ios-blue text-white",
          )}
        >
          {isTranscribing ? <Loader2 aria-hidden="true" className="h-6 w-6 motion-safe:animate-spin" /> : <Mic aria-hidden="true" className="h-6 w-6" />}
        </button>
      </span>

      <button
        type="button"
        onClick={onStartStop}
        className={cn(pill, isActive ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-black")}
        aria-label={isActive ? "Stop camera and narration" : "Start camera and narration"}
      >
        {isActive ? <Square aria-hidden="true" className="h-4 w-4 fill-current" /> : <Play aria-hidden="true" className="h-4 w-4 fill-current" />}
        {isActive ? "Stop" : "Start"}
      </button>

      {showDescribeNow && (
        <button
          type="button"
          onClick={onDescribeNow}
          disabled={describeDisabled}
          className={cn(pill, "bg-ios-blue text-white hover:bg-ios-blue/90")}
          aria-label="Describe now: describe what is in front of me"
        >
          <ScanEye aria-hidden="true" className="h-5 w-5" />
          Describe now
        </button>
      )}

      <div role="group" aria-label="Mode" className="flex flex-wrap items-center justify-center gap-1 rounded-full bg-white/10 p-1">
        {MODES.map(({ mode: option, label, spoken }) => {
          const selected = option === mode;
          const text = option === "finder" && selected && targetItem ? `Find: ${targetItem}` : label;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onModeSelect(option)}
              aria-pressed={selected}
              aria-label={option === "finder" && targetItem ? `${spoken}, currently ${targetItem}` : spoken}
              className={cn(
                pill,
                "min-h-11 max-w-[10rem] px-3",
                selected ? "bg-white text-black" : "text-white hover:bg-white/15",
              )}
            >
              <span className="truncate">{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
