import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
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

export const CaptionDisplay = ({ text, textContent, isVisible, priority = 0, mode = "general", announce = true, isError = false }: CaptionDisplayProps) => {
  const contentKeyRef = useRef(0);
  const prevTextRef = useRef(text);

  const cleanText = sanitizeCaption(text);

  if (cleanText !== prevTextRef.current && cleanText) {
    contentKeyRef.current += 1;
    prevTextRef.current = cleanText;
  }

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
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="fixed bottom-8 left-4 right-4 z-30"
        >
          <motion.div 
            className="bg-gradient-to-br from-black/90 to-black/80 backdrop-blur-2xl rounded-3xl p-5 max-h-52 overflow-y-auto border border-white/10 shadow-2xl"
            layout
            transition={{ duration: 0.3 }}
          >
            <div className="space-y-3">
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
                    className={`text-lg font-medium leading-relaxed tracking-tight ${getAccentClass()}`}
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
                  className="mt-3 pt-3 border-t border-white/15"
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
                      className="text-base text-white/85 leading-relaxed whitespace-pre-wrap font-light"
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
