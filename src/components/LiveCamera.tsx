import { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import Webcam from "react-webcam";
import { SwitchCamera, Loader2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

interface LiveCameraProps {
  onCapture: (base64: string) => Promise<void>;
  isAutoCapturing: boolean;
  isAnalyzing: boolean;
  priority: number;
  smartLoopEnabled: boolean;
  captureRequestId: number;
  cameraEnabled: boolean;
  /** Demo mode: with no camera (off, missing or blocked) show a dark gradient, not an error. */
  demoBackdrop?: boolean;
}

export interface LiveCameraRef {
  getVideoElement: () => HTMLVideoElement | null;
  /** Whether the preview is drawn mirrored, so face boxes must be flipped to match the screen */
  isMirrored: () => boolean;
}

// The preview is shown exactly as the camera sees it (react-webcam's `mirrored` is off), for the
// front camera too. If this is ever turned on, face overlays flip with it via isMirrored().
const MIRROR_FRONT_CAMERA = false;
const isPreviewMirrored = (facingMode: "user" | "environment") =>
  MIRROR_FRONT_CAMERA && facingMode === "user";
 
const DEMO_BACKDROP = "bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950";

export const LiveCamera = forwardRef<LiveCameraRef, LiveCameraProps>(({
  onCapture,
  isAutoCapturing,
  isAnalyzing,
  priority,
  smartLoopEnabled,
  captureRequestId,
  cameraEnabled,
  demoBackdrop = false,
}, ref) => {
  const webcamRef = useRef<Webcam>(null);
  // Default to "user" on desktop (MacBook etc.), "environment" on mobile
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(isMobile ? "environment" : "user");
  const [cameraKey, setCameraKey] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCapturingRef = useRef(false);
  const lastCaptureRequestIdRef = useRef(0);

  const mirrored = isPreviewMirrored(facingMode);
  useImperativeHandle(ref, () => ({
    getVideoElement: () => webcamRef.current?.video ?? null,
    isMirrored: () => mirrored,
  }), [mirrored]);
 
  const captureFrame = useCallback(async () => {
    if (isCapturingRef.current) return;
    if (webcamRef.current) {
      const screenshot = webcamRef.current.getScreenshot();
      if (screenshot) {
        isCapturingRef.current = true;
        try {
          await onCapture(screenshot);
        } finally {
          isCapturingRef.current = false;
        }
      }
    }
  }, [onCapture]);
 
  // Legacy interval mode
  useEffect(() => {
    if (!isAutoCapturing || smartLoopEnabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    if (isAnalyzing || isCapturingRef.current) return;
    captureFrame();
    intervalRef.current = setInterval(() => {
      if (!isAnalyzing && !isCapturingRef.current) captureFrame();
    }, 3500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAutoCapturing, isAnalyzing, captureFrame, smartLoopEnabled]);

  // Smart loop
  useEffect(() => {
    if (
      isAutoCapturing && smartLoopEnabled &&
      captureRequestId > lastCaptureRequestIdRef.current &&
      !isCapturingRef.current
    ) {
      lastCaptureRequestIdRef.current = captureRequestId;
      captureFrame();
    }
  }, [isAutoCapturing, smartLoopEnabled, captureRequestId, captureFrame]);

  useEffect(() => {
    if (!isAutoCapturing) lastCaptureRequestIdRef.current = 0;
  }, [isAutoCapturing]);
 
  const flipCamera = useCallback(async () => {
    if (isFlipping) return;
    setIsFlipping(true);
    // Don't manually stop tracks — iOS Safari doesn't reliably release
    // the camera if you kill the stream before the new getUserMedia call.
    // Just change facingMode + key to force a clean Webcam remount.
    setFacingMode(prev => prev === "user" ? "environment" : "user");
    setCameraKey(prev => prev + 1);
    setCameraError(null);
    // iOS needs extra time to release the old camera and initialize the new one
    setTimeout(() => setIsFlipping(false), 1500);
  }, [isFlipping]);

  const handleCameraError = useCallback((err: string | DOMException) => {
    console.error("Camera error:", err);
    const msg = typeof err === "string" ? err : err.message;
    if (msg.includes("NotAllowed") || msg.includes("Permission denied")) {
      setCameraError("Camera access denied. Go to Settings → Safari → Camera and allow this site.");
    } else if (msg.includes("NotFound") || msg.includes("Requested device not found")) {
      setCameraError("No camera found on this device.");
    } else {
      setCameraError(`Camera error: ${msg}`);
    }
  }, []);
 
  const videoConstraints = {
    facingMode,
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
 
  // The camera feed sits at z-0 under the full-screen push-to-talk overlay (z-20). A fixed
  // element creates its own stacking context, so the interactive controls below are rendered
  // as siblings at z-30 rather than inside the camera layer, where they could never be clicked.
  return (
    <>
    <div className="fixed inset-0 z-0">
      {/* Mount webcam only after user gesture (cameraEnabled) for iOS Safari */}
      {cameraEnabled ? (
        <Webcam
          key={`camera-${cameraKey}-${facingMode}`}
          ref={webcamRef}
          audio={false}
          mirrored={mirrored}
          screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints}
          playsInline
          onUserMedia={() => setCameraError(null)}
          onUserMediaError={handleCameraError}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className={cn("absolute inset-0", demoBackdrop ? DEMO_BACKDROP : "bg-black")} />
      )}
      {cameraEnabled && demoBackdrop && cameraError && <div className={cn("absolute inset-0", DEMO_BACKDROP)} />}

      {/* Flip transition overlay */}
      <AnimatePresence>
        {isFlipping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 flex items-center justify-center z-20"
          >
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Red flash for hazards */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none transition-opacity duration-100",
          priority >= 9 ? "bg-ios-red/30 animate-pulse" : "opacity-0"
        )}
      />

      {/* "Processing…" and the live/connection state are shown by the HUD's status pill */}
    </div>

    {/* Camera error overlay */}
    <AnimatePresence>
      {cameraError && !demoBackdrop && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="alert"
          className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-30 px-8"
        >
          <Camera className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-foreground text-center text-sm font-medium mb-2">Camera Unavailable</p>
          <p className="text-muted-foreground text-center text-xs leading-relaxed">{cameraError}</p>
          <button
            onClick={() => {
              setCameraError(null);
              setCameraKey(prev => prev + 1);
            }}
            className="mt-6 px-6 py-2 rounded-full bg-surface border border-glass-border text-foreground text-sm"
          >
            Try Again
          </button>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Camera flip button */}
    <button
      onClick={flipCamera}
      disabled={isFlipping}
      className={cn(
        "fixed top-4 left-4 z-30 w-11 h-11 rounded-full bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        isFlipping && "opacity-50"
      )}
      aria-label="Switch camera"
    >
      <SwitchCamera aria-hidden="true" className={cn("w-5 h-5 text-white", isFlipping && "motion-safe:animate-spin")} />
    </button>
 
    </>
  );
});

LiveCamera.displayName = "LiveCamera";