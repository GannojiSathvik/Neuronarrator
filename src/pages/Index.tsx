import { useState, useCallback, useRef, useEffect } from "react";
import { DynamicIsland } from "@/components/DynamicIsland";
import { LiveCamera, type LiveCameraRef } from "@/components/LiveCamera";
import { SettingsModal } from "@/components/SettingsModal";
import { type RelationType } from "@/lib/faceDatabase";
import { WarningBanner } from "@/components/WarningBanner";
import { CaptionDisplay } from "@/components/CaptionDisplay";
import { AddPersonModal } from "@/components/AddPersonModal";
import { FaceRecognitionOverlay } from "@/components/FaceRecognitionOverlay";
import { useNeuroVoice, unlockAudioForMobile } from "@/hooks/useNeuroVoice";
import { useHaptics } from "@/hooks/useHaptics";
import { useHapticBraille } from "@/hooks/useHapticBraille";
import { useHazardSound } from "@/hooks/useHazardSound";
import { useFinderSound } from "@/hooks/useFinderSound";
import { useFaceRecognition } from "@/hooks/useFaceRecognition";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import { useVoiceControl, type CommandMode } from "@/hooks/useVoiceControl";
import { HapticBrailleIndicator } from "@/components/HapticBrailleIndicator";
import { PushToTalkOverlay } from "@/components/PushToTalkOverlay";
import { analyzeImage as analyzeImageService, type VisionMode, type KnownFaceInfo } from "@/services/vision";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type AnalysisState = "idle" | "analyzing" | "success" | "warning" | "error";

const Index = () => {
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [textContent, setTextContent] = useState("");
  const [priority, setPriority] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [captureRequestId, setCaptureRequestId] = useState(0);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const isAnalyzingRef = useRef(false);
  const isActiveRef = useRef(false);
  const speechStartedAtRef = useRef<number>(0);
  const watchdogTimerRef = useRef<number | null>(null);
  const cameraRef = useRef<LiveCameraRef>(null);
  const lastDescriptionRef = useRef<string>("");
  const captureCountRef = useRef(0);
  const analysisStartedAtRef = useRef<number>(0);
  // Bumped whenever a capture cycle starts or is abandoned (watchdog, stop). An async step
  // that finishes after its cycle was superseded must not speak or touch the loop flags.
  const analysisCycleRef = useRef(0);

  // Unknown-face pause: suppress TTS for 5s so user can say "neuro remember [name]"
  const unknownFacePauseUntilRef = useRef<number>(0);
  const lastUnknownDescriptorRef = useRef<any>(null);
  const UNKNOWN_FACE_PAUSE_MS = 5000;

  const { speak, stop, isSpeaking, isBusy } = useNeuroVoice();
  const { sosPattern } = useHaptics();
  const { playHapticMessage, stopHaptic, isPlaying: isHapticPlaying, currentChar, currentDots } = useHapticBraille();
  const { playHazardSound } = useHazardSound();
  const { playFoundPing, playNotFoundThrum, playListeningChime } = useFinderSound();

  // Voice control for mode switching (push-to-talk)
  const {
    isListening: isVoiceControlListening,
    transcript: voiceTranscript,
    commandMode,
    targetItem,
    startListening: startVoiceControl,
    stopListening: stopVoiceControl,
    setCommandMode,
    setTargetItem,
  } = useVoiceControl();

  // Map commandMode to VisionMode
  const mode: VisionMode = commandMode === "currency" ? "currency" 
    : commandMode === "finder" ? "finder" 
    : "general";

  const {
    isModelsLoaded,
    isLoadingModels,
    modelLoadError,
    lastMatch,
    lastUnknownDescriptor,
    storedFacesCount,
    detectAndMatch,
    registerCurrentFace,
    loadModels,
    retryLoadModels,
    clearAllFaces,
    generateSpeechText
  } = useFaceRecognition();

  // Keep ref in sync so handleVoiceRemember doesn't need lastUnknownDescriptor as a dep
  lastUnknownDescriptorRef.current = lastUnknownDescriptor;

  // Load face recognition models lazily
  const modelsLoadedOnce = useRef(false);
  useEffect(() => {
    if (isAutoCapturing && !modelsLoadedOnce.current) {
      modelsLoadedOnce.current = true;
      loadModels();
    }
  }, [isAutoCapturing, loadModels]);

  // Kick the next capture
  const triggerNextCapture = useCallback(() => {
    speechStartedAtRef.current = 0;
    if (isActiveRef.current && !isBusy()) {
      setTimeout(() => {
        if (isActiveRef.current && !isAnalyzingRef.current) {
          setCaptureRequestId(prev => prev + 1);
        }
      }, 300);
    }
  }, [isBusy]);

  const onSpeechEnd = useCallback(() => {
    triggerNextCapture();
  }, [triggerNextCapture]);

  // A mode or finder-target change makes any in-flight capture stale: its result was asked
  // for in the old mode and would talk over the mode confirmation. Abandon it, the same way
  // the watchdog does, so the next capture starts in the new mode.
  const isFirstModeRunRef = useRef(true);
  useEffect(() => {
    if (isFirstModeRunRef.current) {
      isFirstModeRunRef.current = false;
      return;
    }
    analysisCycleRef.current += 1;
    isAnalyzingRef.current = false;
    analysisStartedAtRef.current = 0;
  }, [mode, targetItem]);

  // Voice command handler — truly hands-free
  const handleVoiceRemember = useCallback(async (name: string) => {
    console.log("[VoiceRemember] Command received for:", name);

    if (lastUnknownDescriptorRef.current) {
      console.log("[VoiceRemember] Using existing unknown descriptor");
      unknownFacePauseUntilRef.current = 0;
      const success = await registerCurrentFace(name, "Friend", lastUnknownDescriptorRef.current);
      if (success) {
        speak(`Got it, I'll remember ${name}.`, 5, {});
      } else {
        speak(`Couldn't save that face. Try again.`, 5, {});
      }
      return;
    }

    const video = cameraRef.current?.getVideoElement();
    if (!video || video.readyState < 2 || !isModelsLoaded) {
      speak("I can't see anyone right now. Make sure the camera is on.", 5, {});
      return;
    }

    console.log("[VoiceRemember] No cached descriptor, running fresh detection...");
    const match = await detectAndMatch(video);
    
    if (!match || match.known) {
      if (match?.known) {
        speak(`I already know ${match.name}. No need to save again.`, 5, {});
      } else {
        speak("I don't see a face right now. Try facing the camera.", 5, {});
      }
      return;
    }

    unknownFacePauseUntilRef.current = 0;
    const success = await registerCurrentFace(name, "Friend", match.descriptor);
    if (success) {
      speak(`Got it, I'll remember ${name}.`, 5, {});
    } else {
      speak(`Couldn't save that face. Try again.`, 5, {});
    }
  }, [isModelsLoaded, detectAndMatch, registerCurrentFace, speak]);

  const handleVoiceClear = useCallback(() => {
    clearAllFaces();
    speak("All faces cleared from memory.", 5, {});
  }, [clearAllFaces, speak]);

  // Handle mode switching from always-on voice command
  const handleModeSwitch = useCallback((newMode: "standard" | "currency" | "finder", item?: string) => {
    console.log("[ModeSwitch] Hands-free mode switch:", newMode, item);
    setCommandMode(newMode as CommandMode);
    if (newMode === "finder" && item) {
      setTargetItem(item);
      speak(`Finder Mode. Looking for ${item}.`, 5, { onEnd: onSpeechEnd });
    } else if (newMode === "currency") {
      speak("Currency Mode. Show me the notes.", 5, { onEnd: onSpeechEnd });
    } else {
      speak("Standard Mode. Describing scene.", 5, { onEnd: onSpeechEnd });
    }
    // Vibrate for confirmation
    if ("vibrate" in navigator) {
      try { navigator.vibrate([100, 50, 100]); } catch {}
    }
  }, [setCommandMode, setTargetItem, speak, onSpeechEnd]);

  // Always-on voice command listener (active when scanning, paused during push-to-talk)
  const { isListening: isVoiceListening, lastCommand, forceRestart: forceRestartVoice } = useVoiceCommand({
    onRememberCommand: handleVoiceRemember,
    onClearCommand: handleVoiceClear,
    onModeSwitch: handleModeSwitch,
    enabled: isAutoCapturing && !isVoiceControlListening,
  });

  // Watchdog
  useEffect(() => {
    if (!isAutoCapturing) {
      if (watchdogTimerRef.current) {
        window.clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      return;
    }

    watchdogTimerRef.current = window.setInterval(() => {
      if (isAnalyzingRef.current && analysisStartedAtRef.current > 0) {
        const analysisDuration = Date.now() - analysisStartedAtRef.current;
        if (analysisDuration > 15000) {
          console.warn("Watchdog: analysis stuck for 15s+, force-resetting");
          analysisCycleRef.current += 1;
          isAnalyzingRef.current = false;
          analysisStartedAtRef.current = 0;
          setCaptureRequestId(prev => prev + 1);
          return;
        }
      }

      if (isActiveRef.current && !isAnalyzingRef.current && !isBusy()) {
        console.log("Watchdog: forcing next capture");
        setCaptureRequestId(prev => prev + 1);
      } else if (isActiveRef.current && isBusy() && !isSpeaking() && speechStartedAtRef.current > 0) {
        // Only rescue a TTS request stuck loading. Audio that is actually playing has its own
        // safety timer in useNeuroVoice, so a long description is allowed to finish.
        const elapsed = Date.now() - speechStartedAtRef.current;
        if (elapsed > 12000) {
          console.warn("Watchdog: speech stuck loading for 12s+, forcing stop & next capture");
          stop();
          speechStartedAtRef.current = 0;
          setCaptureRequestId(prev => prev + 1);
        }
      }
    }, 5000);

    return () => {
      if (watchdogTimerRef.current) {
        window.clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [isAutoCapturing, isBusy, isSpeaking, stop]);

  const handleCapture = useCallback(async (base64: string): Promise<void> => {
    if (isAnalyzingRef.current) return;
    if (isBusy()) return;
    isAnalyzingRef.current = true;
    analysisStartedAtRef.current = Date.now();
    captureCountRef.current += 1;
    const cycle = ++analysisCycleRef.current;
    const isStale = () => cycle !== analysisCycleRef.current || !isActiveRef.current;

    setAnalysisState("analyzing");

    try {
      // Face detection (only for general mode)
      let knownFaces: KnownFaceInfo[] = [];
      let hasUnknownFace = false;
      if (isModelsLoaded && mode === "general") {
        const video = cameraRef.current?.getVideoElement();
        if (video && video.readyState >= 2) {
          try {
            const faceTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
            const match = await Promise.race([detectAndMatch(video), faceTimeout]);
            if (match) {
              if (match.known && match.context) {
                knownFaces = [{
                  name: match.context.name,
                  relation: match.context.relation,
                  daysSinceLastSeen: match.context.daysSinceLastSeen,
                  isLongAbsence: match.context.isLongAbsence,
                }];
              } else if (!match.known) {
                hasUnknownFace = true;
              }
            }
          } catch (faceErr) {
            console.warn("Face detection skipped:", faceErr);
          }
        }
      }
      if (isStale()) return;

      // Unknown face pause (general mode only)
      if (hasUnknownFace && mode === "general") {
        const now = Date.now();
        if (unknownFacePauseUntilRef.current === 0 || now > unknownFacePauseUntilRef.current) {
          unknownFacePauseUntilRef.current = now + UNKNOWN_FACE_PAUSE_MS;
          console.log("[Loop] Unknown face detected — pausing TTS for 5s for voice registration");
          stop();
          forceRestartVoice();
        }

        if (now < unknownFacePauseUntilRef.current) {
          setAnalysisState("success");
          setCaptionText("Unknown face detected — say \"Neuro remember [name]\" to save");
          isAnalyzingRef.current = false;
          analysisStartedAtRef.current = 0;
          setTimeout(() => {
            if (isActiveRef.current && !isAnalyzingRef.current) {
              setCaptureRequestId(prev => prev + 1);
            }
          }, 1500);
          return;
        }
      } else if (mode === "general") {
        unknownFacePauseUntilRef.current = 0;
      }

      // Send image to vision API with mode + targetItem
      const result = await analyzeImageService(base64, mode, knownFaces, lastDescriptionRef.current, targetItem);
      if (isStale()) {
        console.log("[Loop] Discarding result from an abandoned capture cycle");
        return;
      }

      setPriority(result.priority);
      setCaptionText(result.description);
      setTextContent(result.text_content);
      lastDescriptionRef.current = result.description;

      // Handle finder mode feedback
      if (mode === "finder") {
        if (result.found) {
          setAnalysisState("success");
          setShowWarning(false);
          playFoundPing();
          // Also vibrate on found
          if ("vibrate" in navigator) {
            try { navigator.vibrate([200, 100, 200, 100, 200]); } catch {}
          }
          speechStartedAtRef.current = Date.now();
          speak(result.description, 8, { onEnd: onSpeechEnd });
        } else {
          playNotFoundThrum();
          // Short delay then next capture — no speech for not-found to keep scanning fast
          setAnalysisState("success");
          isAnalyzingRef.current = false;
          analysisStartedAtRef.current = 0;
          setTimeout(() => {
            if (isActiveRef.current && !isAnalyzingRef.current) {
              setCaptureRequestId(prev => prev + 1);
            }
          }, 800);
          return;
        }
      }
      // Handle currency mode
      else if (mode === "currency") {
        setAnalysisState("success");
        setShowWarning(false);
        speechStartedAtRef.current = Date.now();
        speak(result.description, 5, { onEnd: onSpeechEnd });
      }
      // Handle standard/general modes
      else {
        // Describe the scene first, then any text read from it. Speaking only the text would
        // drop the description (and its obstacles) whenever a sign or screen is in view.
        const speechText = result.text_content
          ? `${result.description} It says: ${result.text_content}`
          : result.description;

        if (result.priority > 7) {
          setAnalysisState("warning");
          setShowWarning(true);
          sosPattern();
          playHazardSound(result.priority);
          speechStartedAtRef.current = Date.now();
          speak(`Warning! ${result.description}`, 10, { onEnd: onSpeechEnd });
          const hazardWord = result.description.split(" ").slice(0, 2).join(" ");
          playHapticMessage(hazardWord);
        } else {
          setAnalysisState("success");
          setShowWarning(false);
          playHazardSound(result.priority);
          speechStartedAtRef.current = Date.now();
          speak(speechText, 5, { onEnd: onSpeechEnd });
        }
      }
    } catch (error) {
      if (isStale()) return;
      console.error("Analysis error:", error);
      setAnalysisState("error");
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setCaptionText(errorMsg);
      setTextContent("");
      speak("Hmm, something went wrong. Retrying.", 5, { onEnd: onSpeechEnd });
    } finally {
      // Only the current cycle owns the flags; a late, abandoned cycle must not clear them.
      if (cycle === analysisCycleRef.current) {
        isAnalyzingRef.current = false;
        analysisStartedAtRef.current = 0;
      }
    }
  }, [speak, stop, sosPattern, playHapticMessage, playHazardSound, playFoundPing, playNotFoundThrum, mode, targetItem, onSpeechEnd, triggerNextCapture, isModelsLoaded, detectAndMatch, isBusy, forceRestartVoice]);

  const startStream = useCallback(() => {
    if (isAutoCapturing) return;
    setCameraEnabled(true);
    setIsAutoCapturing(true);
    isActiveRef.current = true;
    unknownFacePauseUntilRef.current = 0;

    unlockAudioForMobile();

    try { localStorage.setItem('neuro-autostart', 'true'); } catch {}

    setTimeout(() => {
      if (isActiveRef.current) {
        // Increment rather than set to 1: if the id is already 1 (a restart after the first
        // capture), setting 1 again is a no-op and the loop would wait for the watchdog.
        setCaptureRequestId(prev => prev + 1);
      }
    }, 1500);
  }, [isAutoCapturing]);

  const stopStream = useCallback(() => {
    setIsAutoCapturing(false);
    isActiveRef.current = false;
    analysisCycleRef.current += 1;
    isAnalyzingRef.current = false;
    captureCountRef.current = 0;
    speechStartedAtRef.current = 0;
    analysisStartedAtRef.current = 0;
    unknownFacePauseUntilRef.current = 0;
    setAnalysisState("idle");
    setCaptionText("");
    setTextContent("");
    setPriority(0);
    setShowWarning(false);
    stop();
    stopHaptic();
  }, [stop, stopHaptic]);

  const toggleAutoCapture = useCallback(() => {
    if (isAutoCapturing) {
      stopStream();
    } else {
      startStream();
    }
  }, [isAutoCapturing, startStream, stopStream]);

  // Auto-start on mount if permissions were previously granted
  useEffect(() => {
    try {
      const shouldAutoStart = localStorage.getItem('neuro-autostart') === 'true';
      if (shouldAutoStart) {
        console.log("[AutoStart] Previously granted permissions detected — auto-starting stream");
        const timer = setTimeout(() => {
          startStream();
        }, 500);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegisterFace = async (name: string, relation: RelationType): Promise<boolean> => {
    const success = await registerCurrentFace(name, relation);
    if (success) {
      speak(`Face saved as ${name}, your ${relation.toLowerCase()}`, 5, {});
    }
    return success;
  };

  const handleClearFaces = async () => {
    await clearAllFaces();
    speak("All faces cleared from memory", 5, {});
  };

  // Push-to-talk handlers
  const handleTouchStart = useCallback(() => {
    if (!isAutoCapturing) return;
    playListeningChime();
    startVoiceControl();
  }, [isAutoCapturing, playListeningChime, startVoiceControl]);

  const handleTouchEnd = useCallback(() => {
    stopVoiceControl();
  }, [stopVoiceControl]);

  // Get mode-specific border color class
  const getModeBorderClass = (): string => {
    if (!isAutoCapturing) return "";
    switch (commandMode) {
      case "currency": return "ring-4 ring-ios-green/70 ring-inset";
      case "finder": return "ring-4 ring-yellow-400/70 ring-inset animate-pulse";
      case "standard": return "ring-4 ring-ios-blue/50 ring-inset";
      default: return "";
    }
  };

  const getStatusText = () => {
    if (isVoiceControlListening) return `Listening... "${voiceTranscript || ""}"`;
    if (analysisState === "analyzing") return "Processing...";
    if (analysisState === "warning") return "⚠ Hazard detected";
    if (analysisState === "error") return "Error — retrying";
    if (isAutoCapturing) {
      if (commandMode === "currency") return "💰 Currency Mode";
      if (commandMode === "finder") return `🔍 Searching for: ${targetItem}`;
      return "👁 Scanning";
    }
    return "Touch anywhere to start";
  };

  return (
    <div className={cn("min-h-screen bg-background flex flex-col relative", getModeBorderClass())}>
      {/* Live Camera Background */}
      <LiveCamera
        ref={cameraRef}
        onCapture={handleCapture}
        isAutoCapturing={isAutoCapturing}
        isAnalyzing={analysisState === "analyzing"}
        priority={priority}
        smartLoopEnabled={true}
        captureRequestId={captureRequestId}
        cameraEnabled={cameraEnabled}
      />

      {/* Warning Banner */}
      <WarningBanner isVisible={showWarning} />

      {/* Face Recognition Overlay */}
      <FaceRecognitionOverlay
        isModelsLoaded={isModelsLoaded}
        isLoadingModels={isLoadingModels}
        modelLoadError={modelLoadError}
        lastMatch={lastMatch}
        hasUnknownFace={!!lastUnknownDescriptor}
        storedFacesCount={storedFacesCount}
        onAddPerson={() => setAddPersonOpen(true)}
        onClearFaces={handleClearFaces}
        onRetryModels={retryLoadModels}
        isVisible={isAutoCapturing || isLoadingModels || !!modelLoadError}
        isVoiceListening={isVoiceListening}
        lastVoiceCommand={lastCommand}
      />

      {/* Dynamic Island */}
      <div className={`flex justify-center pt-4 pb-2 relative z-10 ${showWarning ? "mt-16" : ""}`}>
        <DynamicIsland status={analysisState} priority={priority} commandMode={commandMode} />
      </div>

      {/* Settings button — small, top-right corner */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSettingsOpen(true);
        }}
        className="fixed top-4 right-16 z-30 w-10 h-10 rounded-full bg-surface/60 backdrop-blur-xl border border-glass-border flex items-center justify-center"
        aria-label="Settings"
      >
        <Settings className="w-5 h-5 text-muted-foreground" />
      </button>

      {/* Status text */}
      <div className="flex justify-center px-4 pt-2 relative z-10">
        <div className="glass-panel super-ellipse-sm px-4 py-2">
          <p className="text-sm text-muted-foreground text-center tracking-tight">
            {getStatusText()}
          </p>
        </div>
      </div>

      {/* Push-to-Talk Overlay — full screen touch target */}
      <PushToTalkOverlay
        isListening={isVoiceControlListening}
        isActive={isAutoCapturing}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onStartStream={toggleAutoCapture}
        transcript={voiceTranscript}
        commandMode={commandMode}
      />

      {/* Caption Display */}
      <CaptionDisplay
        text={captionText}
        textContent={textContent}
        isVisible={analysisState === "success" || analysisState === "warning" || analysisState === "error"}
        priority={priority}
        mode={mode}
      />

      {/* Haptic Braille Indicator */}
      <HapticBrailleIndicator
        isPlaying={isHapticPlaying}
        currentChar={currentChar}
        currentDots={currentDots}
      />

      {/* Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Add Person Modal */}
      <AddPersonModal
        isOpen={addPersonOpen}
        onClose={() => setAddPersonOpen(false)}
        onSave={handleRegisterFace}
      />
    </div>
  );
};

export default Index;
