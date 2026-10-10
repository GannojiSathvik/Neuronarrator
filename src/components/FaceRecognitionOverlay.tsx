import { motion, AnimatePresence } from "framer-motion";
import { User, UserX, Brain, Loader2, UserPlus, Clock, Users, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FaceMatch } from "@/hooks/useFaceRecognition";
import { FaceMemoryContext } from './FaceMemoryContext';

interface FaceRecognitionOverlayProps {
  isModelsLoaded: boolean;
  isLoadingModels: boolean;
  modelLoadError: string | null;
  lastMatch: FaceMatch | null;
  hasUnknownFace: boolean;
  // Face management (counts, forgetting) lives in the Memory space, not on the camera screen
  storedFacesCount?: number;
  onAddPerson: () => void;
  onClearFaces?: () => void;
  onRetryModels?: () => void;
  isVisible: boolean;
  isVoiceListening?: boolean;
  lastVoiceCommand?: string | null;
  // The person card is rendered next to the tracked face by the page instead
  hidePersonCard?: boolean;
}

export const FaceRecognitionOverlay = ({
  isModelsLoaded,
  isLoadingModels,
  modelLoadError,
  lastMatch,
  hasUnknownFace,
  onAddPerson,
  onRetryModels,
  isVisible,
  isVoiceListening = false,
  lastVoiceCommand,
  hidePersonCard = false,
}: FaceRecognitionOverlayProps) => {
  if (!isVisible) return null;

  return (
    // Under the camera-flip button, in the HUD's dark glass style. Compact, so it doesn't fight the
    // face tags for space.
    <div className="fixed top-[4.25rem] left-4 z-30 w-[min(20rem,calc(100vw-2rem))] flex flex-col items-start gap-2 pointer-events-none [&>*]:pointer-events-auto">
      {/* Model Loading Status */}
      <AnimatePresence>
        {isLoadingModels && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl bg-black/55 backdrop-blur-md border border-white/15 px-3 py-2 flex items-center gap-3"
          >
            <Brain className="w-5 h-5 text-ios-purple animate-pulse" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Loading face recognition…</p>
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
            className="w-full rounded-2xl bg-black/70 backdrop-blur-md border border-ios-red/50 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ios-red">Model Load Failed</p>
                <p className="text-xs text-white/75 truncate">{modelLoadError}</p>
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
            className="rounded-2xl bg-black/55 backdrop-blur-md border border-white/15 px-3 py-2 flex items-center gap-2"
          >
            <Mic className="w-4 h-4 text-ios-green animate-pulse" />
            <p className="text-sm text-white/85 flex-1">
              {lastVoiceCommand 
                ? <span className="text-ios-green font-medium">{lastVoiceCommand}</span>
                : <>Say <span className="text-white font-medium">"Neuro remember [name]"</span> to save a face</>
              }
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Face Recognition Result (shown beside the face instead when the face is being tracked) */}
      <AnimatePresence mode="wait">
        {isModelsLoaded && lastMatch && !hidePersonCard && (
          <PersonCard
            key={lastMatch.known ? lastMatch.name : 'unknown'}
            match={lastMatch}
            hasUnknownFace={hasUnknownFace}
            onAddPerson={onAddPerson}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

interface PersonCardProps {
  match: FaceMatch;
  hasUnknownFace: boolean;
  onAddPerson: () => void;
  // Smaller padding and a single saved note, for the panel that sits beside a face
  compact?: boolean;
}

export const PersonCard = ({ match, hasUnknownFace, onAddPerson, compact = false }: PersonCardProps) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: 0.2 }}
    className={cn(
      "glass-panel super-ellipse-sm",
      compact ? "p-3" : "p-4",
      match.known 
        ? "border border-ios-green/30 bg-ios-green/10" 
        : "border border-ios-orange/30 bg-ios-orange/10"
    )}
  >
    <div className="flex items-center gap-3">
      {match.known ? (
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
          match.known ? "text-ios-green" : "text-ios-orange"
        )}>
          {match.name}
        </p>
        {match.known && match.context ? (
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              {match.context.relation}
            </p>
            {match.context.isLongAbsence && (
              <p className="text-xs text-ios-orange flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last seen {match.context.daysSinceLastSeen} days ago
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {match.distance !== undefined ? 'Possible face match — confirm their identity' : 'Face enrollment saved'}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Face not recognized — say "Neuro remember [name]"
          </p>
        )}
      </div>
      {!match.known && hasUnknownFace && (
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
    {match.known && match.id !== undefined && <FaceMemoryContext personId={match.id} limit={compact ? 1 : 2} />}
  </motion.div>
);
