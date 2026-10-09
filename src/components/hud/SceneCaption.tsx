import { useEffect, useState, type SyntheticEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type VisionMode } from "@/services/vision";
import { sanitizeCaption } from "@/lib/captionText";
import { WORD_REVEAL_MS } from "@/lib/reveal";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";

interface SceneCaptionProps {
  text: string;
  textContent?: string;
  isVisible: boolean;
  priority?: number;
  mode?: VisionMode;
  // Whether screen readers should read captions as they change (off while the app speaks them itself)
  announce?: boolean;
  // Error captions are always announced, even when announce is off
  isError?: boolean;
}

/**
 * Subtitle-style caption just above the control bar. A new caption appears word by word
 * (~40ms a word, instantly with reduced motion), clamped to a few lines; tap to expand.
 */
export const SceneCaption = ({ text, textContent, isVisible, priority = 0, mode = "general", announce = true, isError = false }: SceneCaptionProps) => {
  // Collapsed to a few lines so the bar doesn't block the view; tap to read it all.
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const cleanText = sanitizeCaption(text);
  const shownText = useReveal(cleanText, "word", WORD_REVEAL_MS, { animate: !reduceMotion });

  // A new caption starts collapsed again
  useEffect(() => {
    setExpanded(false);
  }, [cleanText]);

  const toggleExpanded = (event: SyntheticEvent) => {
    // The full-screen push-to-talk layer sits underneath; don't let this tap reach it.
    event.stopPropagation();
    setExpanded((value) => !value);
  };

  const hasTranscribedText = !!textContent && textContent.length > 0;
  const hasDescription = cleanText.length > 0;
  // In Read mode the text is the answer, so it's shown large and the description is just context
  const isReader = mode === "reader";

  return (
    <>
      {/* Errors go to a dedicated, always-mounted alert region so they're read even when the caption region is off */}
      <p role="alert" className="sr-only">
        {isVisible && isError ? cleanText : ""}
      </p>
      <div aria-live={announce && !isError ? "polite" : "off"} aria-atomic="true" className="flex justify-center">
        <AnimatePresence>
          {isVisible && (hasDescription || hasTranscribedText) && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
              transition={{ duration: 0.2 }}
              role="button"
              tabIndex={0}
              // No aria-label: the caption text itself must stay what screen readers read.
              aria-expanded={expanded}
              onClick={toggleExpanded}
              onTouchStart={(event) => event.stopPropagation()}
              onTouchEnd={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleExpanded(event);
                }
              }}
              className="pointer-events-auto w-full max-w-2xl cursor-pointer rounded-2xl bg-black/65 px-4 py-3 text-center shadow-lg backdrop-blur-md max-h-[40vh] overflow-y-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {hasDescription && (
                <p
                  className={cn(
                    "font-medium leading-snug text-white",
                    isReader ? "text-[1rem] text-white/85" : "text-[1.125rem] sm:text-[1.25rem]",
                    priority > 7 && "text-red-200",
                    !expanded && (isReader ? "line-clamp-2" : "line-clamp-3"),
                  )}
                >
                  {/* Screen readers get the whole caption; the word-by-word reveal is visual only */}
                  <span className="sr-only">{cleanText}</span>
                  <span aria-hidden="true">{shownText}</span>
                </p>
              )}
              {hasTranscribedText && (
                <p
                  className={cn(
                    "whitespace-pre-wrap leading-snug text-white",
                    isReader ? "mt-1 text-[1.25rem] font-semibold" : "mt-2 border-t border-white/20 pt-2 text-[1.125rem] text-white/90",
                    !expanded && (isReader ? "line-clamp-6" : "line-clamp-2"),
                  )}
                >
                  {!isReader && <span className="mr-2 text-[0.875rem] font-semibold uppercase tracking-wider text-sky-300">Text:</span>}
                  {textContent}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
