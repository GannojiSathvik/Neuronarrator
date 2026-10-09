import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseVoiceInputReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  reset: () => void;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Bumped by reset() and each new recording. A transcription that finishes after its session
  // was cancelled must not fill in a name (it would pre-fill the next person's form).
  const sessionRef = useRef(0);

  const startRecording = useCallback(async () => {
    sessionRef.current += 1;
    setError(null);
    setTranscript(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // Use webm/opus which is widely supported; fall back to the browser default
      // (e.g. Safari only supports audio/mp4 — passing an unsupported mimeType throws)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      console.log("Voice recording started");
    } catch (err) {
      console.error("Microphone access error:", err);
      // Release the mic if getUserMedia succeeded but MediaRecorder setup failed
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
      setError("Could not access microphone. Please check permissions.");
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      return null;
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;
      const session = sessionRef.current;
      const cancelled = () => session !== sessionRef.current;

      mediaRecorder.onstop = async () => {
        if (cancelled()) {
          resolve(null);
          return;
        }
        // Stop all tracks
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        setIsRecording(false);
        setIsTranscribing(true);

        try {
          const recordedType = (mediaRecorder.mimeType || "audio/webm").split(";")[0];
          const audioBlob = new Blob(chunksRef.current, { type: recordedType });
          console.log("Audio recorded, size:", audioBlob.size, "bytes");

          if (audioBlob.size < 1000) {
            setError("Recording too short. Please try again.");
            setIsTranscribing(false);
            resolve(null);
            return;
          }

          // Convert blob to base64
          const arrayBuffer = await audioBlob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const audioBase64 = btoa(binary);

          console.log("Sending audio to STT, base64 length:", audioBase64.length);

          // Call the edge function
          const { data, error: fnError } = await supabase.functions.invoke(
            "speech-to-text",
            {
              body: { audioBase64, language_code: "en-IN", mime_type: recordedType },
            }
          );
          if (cancelled()) {
            resolve(null);
            return;
          }

          if (fnError) {
            console.error("STT edge function error:", fnError);
            setError("Voice recognition failed. Please try again or type manually.");
            setIsTranscribing(false);
            resolve(null);
            return;
          }

          const text = data?.transcript?.trim() || null;
          console.log("STT transcript:", text);

          if (!text) {
            setError("Could not understand. Please speak clearly and try again.");
            setIsTranscribing(false);
            resolve(null);
            return;
          }

          setTranscript(text);
          setIsTranscribing(false);
          resolve(text);
        } catch (err) {
          if (cancelled()) {
            resolve(null);
            return;
          }
          console.error("Transcription error:", err);
          setError("Voice recognition failed. Please try again.");
          setIsTranscribing(false);
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, []);

  const reset = useCallback(() => {
    sessionRef.current += 1;
    // Stop any ongoing recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setIsTranscribing(false);
    setTranscript(null);
    setError(null);
  }, []);

  // Release the microphone if the component unmounts mid-recording
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        try { recorder.stop(); } catch { /* already stopped */ }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return {
    isRecording,
    isTranscribing,
    transcript,
    error,
    startRecording,
    stopRecording,
    reset,
  };
}
