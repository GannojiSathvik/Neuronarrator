import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, UserX, Brain, Loader2, UserPlus, Trash2, Clock, Users, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FaceMatch } from "@/hooks/useFaceRecognition";
import { FaceMemoryContext } from './FaceMemoryContext';
import { confirmStep, CONFIRM_WINDOW_MS } from "@/lib/confirmWindow";

interface FaceRecognitionOverlayProps {
  isModelsLoaded: boolean;
  isLoadingModels: boolean;
  modelLoadError: string | null;
  lastMatch: FaceMatch | null;
  hasUnknownFace: boolean;
  storedFacesCount: number;
  onAddPerson: () => void;
  onClearFaces: () => void;
  onRetryModels?: () => void;
  isVisible: boolean;
  isVoiceListening?: boolean;
  lastVoiceCommand?: string | null;
}

export const FaceRecognitionOverlay = ({
  isModelsLoaded,
  isLoadingModels,
  modelLoadError,
  lastMatch,
  hasUnknownFace,
  storedFacesCount,
  onAddPerson,
  onClearFaces,
  onRetryModels,
  isVisible,
  isVoiceListening = false,
  lastVoiceCommand,
}: FaceRecognitionOverlayProps) => {
  // Forgetting faces is irreversible: the first tap arms, a second tap within the window clears
  const [clearArmedAt, setClearArmedAt] = useState<number | null>(null);

  // Revert the armed button once the confirmation window passes
  useEffect(() => {
    if (clearArmedAt === null) return;
    const timeout = window.setTimeout(() => setClearArmedAt(null), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timeout);
  }, [clearArmedAt]);

  const handleClearPress = () => {
    const { confirmed, armedAt } = confirmStep(clearArmedAt, Date.now());
    setClearArmedAt(armedAt);
    if (confirmed) onClearFaces();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-16 left-4 right-4 z-30 flex flex-col gap-2 pointer-events-none [&>*]:pointer-events-auto">
      {/* Model Loading Status */}
      <AnimatePresence>
        {isLoadingModels && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-panel super-ellipse-sm p-3 flex items-center gap-3"
          >
            <Brain className="w-5 h-5 text-ios-purple animate-pulse" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Loading Neural Nets...</p>
              <p className="text-xs text-muted-foreground">Initializing face recognition</p>
            </div>
            <Loader2 className="w-4 h-4 text-ios-blue animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Model Error with Retry */}
      <AnimatePresence>
        {modelLoadError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-panel super-ellipse-sm p-3 border border-ios-red/30 bg-ios-red/10"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ios-red">Model Load Failed</p>
                <p className="text-xs text-muted-foreground truncate">{modelLoadError}</p>
              </div>
              {onRetryModels && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRetryModels}
                  className="shrink-0 border-ios-red/30 text-ios-red hover:bg-ios-red/10"
                >
                  Retry
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Command Listening Indicator */}
      <AnimatePresence>
        {isVoiceListening && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-panel super-ellipse-sm px-3 py-2 flex items-center gap-2"
          >
            <Mic className="w-4 h-4 text-ios-green animate-pulse" />
            <p className="text-xs text-muted-foreground flex-1">
              {lastVoiceCommand 
                ? <span className="text-ios-green font-medium">{lastVoiceCommand}</span>
                : <>Say <span className="text-foreground font-medium">"Neuro remember [name]"</span> to save a face</>
              }
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Face Recognition Result */}
      <AnimatePresence mode="wait">
        {isModelsLoaded && lastMatch && (
          <motion.div
            key={lastMatch.known ? lastMatch.name : 'unknown'}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "glass-panel super-ellipse-sm p-4",
              lastMatch.known 
                ? "border border-ios-green/30 bg-ios-green/10" 
                : "border border-ios-orange/30 bg-ios-orange/10"
            )}
          >
            <div className="flex items-center gap-3">
              {lastMatch.known ? (
                <div className="w-10 h-10 rounded-full bg-ios-green/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-ios-green" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-ios-orange/20 flex items-center justify-center">
                  <UserX className="w-5 h-5 text-ios-orange" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-lg font-semibold truncate",
                  lastMatch.known ? "text-ios-green" : "text-ios-orange"
                )}>
                  {lastMatch.name}
                </p>
                {lastMatch.known && lastMatch.context ? (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {lastMatch.context.relation}
                    </p>
                    {lastMatch.context.isLongAbsence && (
                      <p className="text-xs text-ios-orange flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last seen {lastMatch.context.daysSinceLastSeen} days ago
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {lastMatch.distance !== undefined ? 'Possible face match — confirm their identity' : 'Face enrollment saved'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Face not recognized — say "Neuro remember [name]"
                  </p>
                )}
              </div>
              {!lastMatch.known && hasUnknownFace && (
                <Button
                  size="sm"
                  onClick={onAddPerson}
                  className="bg-ios-blue hover:bg-ios-blue/90 text-white"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              )}
            </div>
            {lastMatch.known && lastMatch.id !== undefined && <FaceMemoryContext personId={lastMatch.id} />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stored Faces Count & Clear Button */}
      <AnimatePresence>
        {isModelsLoaded && storedFacesCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between px-2"
          >
            <p className="text-xs text-muted-foreground">
              {storedFacesCount} face{storedFacesCount !== 1 ? 's' : ''} in memory
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearPress}
              className={cn(
                "text-xs hover:text-ios-red",
                clearArmedAt !== null ? "text-ios-red" : "text-muted-foreground"
              )}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              {clearArmedAt !== null ? "Tap again to forget all faces" : "Forget faces"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kept mounted so screen readers announce the armed state when it appears */}
      <p role="status" aria-live="polite" className="sr-only">
        {clearArmedAt !== null ? "Tap again within 5 seconds to forget all faces" : ""}
      </p>
    </div>
  );
};
