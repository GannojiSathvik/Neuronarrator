import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { type VisionMode } from "@/services/vision";

interface CaptionDisplayProps {
  text: string;
  textContent?: string;
  isVisible: boolean;
  priority?: number;
  mode?: VisionMode;
  // Whether screen readers should read captions as they change (off while the app speaks them itself)
  announce?: boolean;
  // Error captions are always announced, even when announce is off
  isError?: boolean;
  // "corner": a small box in the bottom-right corner. "inline": no positioning of its own,
  // for when the parent places it beside a face.
  placement?: "corner" | "inline";
}

// Safety: if the AI returns raw JSON instead of a clean description, extract it
function sanitizeCaption(raw: string): string {
  if (!raw) return "";
  if (raw.trim().startsWith("{") || raw.includes('"description"')) {
    const cleaned = raw.replace(/<\|[^|]*\|>/g, "").replace(/\bassistant\b/g, "");
    const match = cleaned.match(/"description"\s*:\s*"([^"]+)"/);
    if (match) return match[1];
    return raw
      .replace(/[{}":[\]]/g, "")
      .replace(/text_content|description|hazards|priority|found/g, "")
      .replace(/<\|[^|]*\|>/g, "")
      .replace(/\bassistant\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return raw;
}

export const CaptionDisplay = ({ text, textContent, isVisible, priority = 0, mode = "general", announce = true, isError = false, placement = "corner" }: CaptionDisplayProps) => {
  const contentKeyRef = useRef(0);
  // Collapsed to a few lines so the box doesn't block the view; tap to read it all.
  const [expanded, setExpanded] = useState(false);
  const prevTextRef = useRef(text);

  const cleanText = sanitizeCaption(text);

  if (cleanText !== prevTextRef.current && cleanText) {
    contentKeyRef.current += 1;
    prevTextRef.current = cleanText;
  }

  // A new caption starts collapsed again
  useEffect(() => {
    setExpanded(false);
  }, [cleanText]);

  const toggleExpanded = (event: React.SyntheticEvent) => {
    // The full-screen push-to-talk layer sits underneath; don't let this tap reach it.
    event.stopPropagation();
    setExpanded((value) => !value);
  };

  const hasTranscribedText = textContent && textContent.length > 0;
  const hasDescription = cleanText && cleanText.length > 0;

  // Mode-specific accent color
  const getAccentClass = () => {
    if (priority > 7) return "text-ios-red drop-shadow-[0_0_8px_hsl(var(--ios-red)/0.5)]";
    if (mode === "currency") return "text-ios-green";
    if (mode === "finder") return "text-yellow-400";
    return "text-white/95";
  };

  const getModeLabel = () => {
    if (mode === "currency") return "💰 Currency";
    if (mode === "finder") return "🔍 Found";
    return null;
  };

  return (
    <>
    {/* Errors go to a dedicated, always-mounted alert region so they're read even when the caption region is off */}
    <p role="alert" className="sr-only">
      {isVisible && isError ? cleanText : ""}
    </p>
    <div aria-live={announce && !isError ? "polite" : "off"} aria-atomic="true">
    <AnimatePresence>
      {isVisible && (hasDescription || hasTranscribedText) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={
            placement === "corner"
              ? "fixed bottom-20 sm:bottom-5 right-4 z-30 w-[min(22rem,calc(100vw-2rem))]"
              : "w-full"
          }
        >
          <motion.div
            role="button"
            tabIndex={0}
            // No aria-label: the caption text itself must stay what screen readers read.
            aria-expanded={expanded}
            onClick={toggleExpanded}
            onTouchStart={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") toggleExpanded(event);
            }}
            // See-through and compact: the camera view stays visible behind it.
            className="bg-black/55 backdrop-blur-md rounded-2xl p-3 max-h-[45vh] overflow-y-auto border border-white/10 shadow-lg cursor-pointer"
            layout
            transition={{ duration: 0.2 }}
          >
            <div className="space-y-2">
              {/* Mode label */}
              {getModeLabel() && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {getModeLabel()}
                  </span>
                </div>
              )}

              {/* Scene description */}
              {hasDescription && (
                <AnimatePresence mode="wait">
                  <motion.p
                    key={contentKeyRef.current}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className={`text-[15px] font-medium leading-snug tracking-tight ${expanded ? "" : "line-clamp-3"} ${getAccentClass()}`}
                  >
                    {cleanText}
                  </motion.p>
                </AnimatePresence>
              )}
              
              {/* Transcribed text section */}
              {hasTranscribedText && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.15 }}
                  className="mt-2 pt-2 border-t border-white/15"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-ios-blue animate-pulse" />
                    <span className="text-xs text-ios-blue font-semibold uppercase tracking-widest">
                      Text Found
                    </span>
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p 
                      key={textContent}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                      className={`text-sm text-white/85 leading-snug whitespace-pre-wrap font-light ${expanded ? "" : "line-clamp-2"}`}
                    >
                      {textContent}
                    </motion.p>
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
    </>
  );
};
