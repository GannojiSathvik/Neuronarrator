import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusPillProps {
  connected: boolean;
  processing: boolean;
}

/** Top-right pill: green dot "Connected", red dot "Reconnecting…", or "Processing…" while a
 *  frame is being analysed (the dot still shows the connection). */
export function StatusPill({ connected, processing }: StatusPillProps) {
  const connection = connected ? "Connected" : "Reconnecting…";
  return (
    <div className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-black/55 px-4 text-[1rem] font-medium text-white shadow-lg backdrop-blur-md">
      {/* Only the connection is announced; the page's own status region already says "Processing" */}
      <span role="status" aria-live="polite" className="sr-only">
        {connection}
      </span>
      <span
        aria-hidden="true"
        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", connected ? "bg-emerald-400" : "bg-ios-red motion-safe:animate-pulse")}
      />
      {processing ? (
        <>
          <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
          <span aria-hidden="true">Processing…</span>
        </>
      ) : (
        <span aria-hidden="true">{connection}</span>
      )}
    </div>
  );
}
