 import { useCallback, useEffect, useRef } from "react";
 
 export const useHazardSound = () => {
   const audioContextRef = useRef<AudioContext | null>(null);
   const isPlayingRef = useRef(false);
 
   const getAudioContext = useCallback(() => {
     if (!audioContextRef.current) {
       audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
     }
     // Resume if suspended (autoplay policy / iOS) — otherwise hazard sounds are silent
     if (audioContextRef.current.state === "suspended") {
       audioContextRef.current.resume().catch(() => undefined);
     }
     return audioContextRef.current;
   }, []);

   // Release the AudioContext on unmount
   useEffect(() => {
     return () => {
       audioContextRef.current?.close().catch(() => undefined);
       audioContextRef.current = null;
     };
   }, []);
 
   // Low-frequency thrum for caution (priority 6-8)
   const playCautionSound = useCallback(() => {
     const ctx = getAudioContext();
     const oscillator = ctx.createOscillator();
     const gainNode = ctx.createGain();
 
     oscillator.connect(gainNode);
     gainNode.connect(ctx.destination);
 
     oscillator.type = "sine";
     oscillator.frequency.setValueAtTime(120, ctx.currentTime); // Low frequency thrum
 
     gainNode.gain.setValueAtTime(0, ctx.currentTime);
     gainNode.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
     gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
 
     oscillator.start(ctx.currentTime);
     oscillator.stop(ctx.currentTime + 0.3);
   }, [getAudioContext]);
 
   // Rapid high-pitched Geiger counter clicks for danger (priority 9-10)
   const playDangerSound = useCallback(() => {
     if (isPlayingRef.current) return;
     isPlayingRef.current = true;
 
     const ctx = getAudioContext();
     const clickCount = 8;
     const clickInterval = 0.08; // 80ms between clicks
 
     for (let i = 0; i < clickCount; i++) {
       const startTime = ctx.currentTime + i * clickInterval;
 
       const oscillator = ctx.createOscillator();
       const gainNode = ctx.createGain();
 
       oscillator.connect(gainNode);
       gainNode.connect(ctx.destination);
 
       oscillator.type = "square";
       oscillator.frequency.setValueAtTime(2400 + Math.random() * 400, startTime); // High pitch with variation
 
       gainNode.gain.setValueAtTime(0, startTime);
       gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
       gainNode.gain.linearRampToValueAtTime(0, startTime + 0.04);
 
       oscillator.start(startTime);
       oscillator.stop(startTime + 0.05);
     }
 
     setTimeout(() => {
       isPlayingRef.current = false;
     }, clickCount * clickInterval * 1000 + 100);
   }, [getAudioContext]);
 
   const playHazardSound = useCallback((priority: number) => {
     if (priority >= 9) {
       playDangerSound();
     } else if (priority >= 6) {
       playCautionSound();
     }
     // Priority 1-5: No sound
   }, [playCautionSound, playDangerSound]);
 
   // Call from a tap handler: iOS only lets an AudioContext start inside a user gesture, and
   // hazard sounds otherwise first play from the async analysis loop, where it stays suspended.
   const unlock = useCallback(() => {
     getAudioContext();
   }, [getAudioContext]);
 
   return { playHazardSound, unlock };
 };