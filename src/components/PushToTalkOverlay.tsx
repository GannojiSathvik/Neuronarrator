import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Mic, Play } from "lucide-react";
import { type CommandMode } from "@/hooks/useVoiceControl";

interface PushToTalkOverlayProps {
  isListening: boolean;
  /** Released, and the command is still being transcribed */
  isTranscribing?: boolean;
  isActive: boolean;
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onStartStream: () => void;
  transcript: string;
  commandMode: CommandMode;
}

export const PushToTalkOverlay = ({
  isListening,
  isTranscribing = false,
  isActive,
  onTouchStart,
  onTouchEnd,
  onStartStream,
  transcript,
  commandMode,
}: PushToTalkOverlayProps) => {
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isActive) {
      onStartStream();
      return;
    }
    onTouchStart();
  };

  const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isActive) return;
    onTouchEnd();
  };

  // Keyboard: Enter/Space starts the stream; once active, hold Enter/Space to talk
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (e.repeat) return;
    if (!isActive) {
      onStartStream();
      return;
    }
    onTouchStart();
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (isActive) onTouchEnd();
  };

  // Screen readers activate with a synthetic click (detail === 0) rather than touch/mouse events,
  // and cannot press-and-hold. Start the app, then toggle listening on each activation.
  const handleClick = (e: React.MouseEvent) => {
    if (e.detail !== 0) return;
    if (!isActive) onStartStream();
    else if (isListening) onTouchEnd();
    else onTouchStart();
  };

  return (
    <div
      className="fixed inset-0 z-20"
      role="button"
      tabIndex={0}
      aria-label={
        !isActive
          ? "Start NeuroNarrator"
          : isListening
          ? "Listening. Release to process command"
          : isTranscribing
          ? "Understanding your command"
          : "Hold to speak a command"
      }
      aria-pressed={isActive ? isListening : undefined}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      style={{ touchAction: "none" }}
    >
      {/* Center content — shows different state based on active/listening */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <AnimatePresence mode="wait">
          {!isActive ? (
            /* Not started — show big play prompt */
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-6"
            >
              <div className="w-24 h-24 rounded-full bg-surface/60 backdrop-blur-xl border-2 border-glass-border flex items-center justify-center">
                <Play className="w-10 h-10 text-foreground ml-1" />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                  NeuroNarrator
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                  Tap anywhere to start
                </p>
              </div>
            </motion.div>
          ) : isListening ? (
            /* Listening — pulsing microphone */
            <motion.div
              key="listening"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center gap-4"
            >
              {/* Pulsing rings */}
              <div className="relative">
                <motion.div
                  className="absolute inset-0 rounded-full bg-ios-blue/20"
                  animate={{
                    scale: [1, 1.8, 1],
                    opacity: [0.5, 0, 0.5],
                  }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                  style={{ width: 96, height: 96, top: -8, left: -8 }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full bg-ios-blue/30"
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.6, 0, 0.6],
                  }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
                  style={{ width: 80, height: 80 }}
                />
                <div className="relative w-20 h-20 rounded-full bg-ios-blue/90 flex items-center justify-center">
                  <Mic className="w-8 h-8 text-foreground" />
                </div>
              </div>

              {/* Live transcript */}
              {transcript && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-panel super-ellipse-sm px-5 py-3 max-w-xs"
                >
                  <p className="text-sm text-foreground text-center font-medium">
                    "{transcript}"
                  </p>
                </motion.div>
              )}

              <p className="text-xs text-muted-foreground">
                Release to process command
              </p>
            </motion.div>
          ) : isTranscribing ? (
            /* Released — waiting for the server transcript */
            <motion.div
              key="transcribing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-20 h-20 rounded-full bg-ios-blue/40 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-foreground animate-spin" />
              </div>
              {transcript && (
                <div className="glass-panel super-ellipse-sm px-5 py-3 max-w-xs">
                  <p className="text-sm text-foreground text-center font-medium">
                    "{transcript}"
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Understanding…</p>
            </motion.div>
          ) : (
            /* Active but not listening — subtle hold prompt */
            <motion.div
              key="active-idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2 mt-32"
            >
              <motion.div
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <Mic className="w-6 h-6 text-muted-foreground" />
              </motion.div>
              <p className="text-xs text-muted-foreground/60">
                Hold to speak a command
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
