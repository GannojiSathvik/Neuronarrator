import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { HAZARD_BANNER_MS, type HudHazard } from "@/lib/hudState";

/** Red banner that slides down from the top with the hazard, and leaves after 4 seconds.
 *  Speech, vibration and the alarm sound are the page's job; this is only the visual. */
export function HazardBanner({ hazard }: { hazard?: HudHazard }) {
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReducedMotion();
  const at = hazard?.at;

  useEffect(() => {
    if (at === undefined) {
      setVisible(false);
      return;
    }
    const remaining = HAZARD_BANNER_MS - (Date.now() - at);
    setVisible(remaining > 0);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setVisible(false), remaining);
    return () => window.clearTimeout(timer);
  }, [at]);

  return (
    // Always mounted, so screen readers announce the text when it appears
    <div role="alert" className="pointer-events-none fixed inset-x-0 top-0 z-40">
      <AnimatePresence>
        {visible && hazard && (
          <motion.div
            key={hazard.at}
            initial={reduceMotion ? { opacity: 0 } : { y: "-100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "-100%" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-center justify-center gap-3 bg-ios-red px-5 py-4 shadow-lg"
          >
            <AlertTriangle aria-hidden="true" className="h-8 w-8 shrink-0 text-white" />
            <span className="text-[1.375rem] font-bold leading-tight tracking-tight text-white">{hazard.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
