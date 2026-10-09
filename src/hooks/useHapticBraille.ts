 import { useState, useCallback, useRef, useEffect } from "react";
 
 // Standard Braille dot patterns for haptic feedback (6-dot cell: dots 1-6)
 // Dot positions: 1 4
 //                2 5
 //                3 6
 const BRAILLE_MAP: Record<string, number[]> = {
   A: [1],
   B: [1, 2],
   C: [1, 4],
   D: [1, 4, 5],
   E: [1, 5],
   F: [1, 2, 4],
   G: [1, 2, 4, 5],
   H: [1, 2, 5],
   I: [2, 4],
   J: [2, 4, 5],
   K: [1, 3],
   L: [1, 2, 3],
   M: [1, 3, 4],
   N: [1, 3, 4, 5],
   O: [1, 3, 5],
   P: [1, 2, 3, 4],
   Q: [1, 2, 3, 4, 5],
   R: [1, 2, 3, 5],
   S: [2, 3, 4],
   T: [2, 3, 4, 5],
   U: [1, 3, 6],
   V: [1, 2, 3, 6],
   W: [2, 4, 5, 6],
   X: [1, 3, 4, 6],
   Y: [1, 3, 4, 5, 6],
   Z: [1, 3, 5, 6],
   " ": [], // Space between words
 };
 
 // Timing constants (in ms)
 const DOT_PRESENT = 150;        // Raised dot: long buzz
 const DOT_ABSENT = 30;          // Flat dot: short tick, so every slot is felt and leading blanks aren't lost
 const SLOT_GAP = 100;           // Pause between the six dot slots
 const CHAR_SEPARATOR = 400;     // Pause between characters (clearly longer than SLOT_GAP)
 const WORD_SEPARATOR = 800;     // Pause for a space between words
 
 /**
  * Convert a character to its vibration pattern (navigator.vibrate format: buzz, pause, buzz, ...).
  * Every one of the six dot positions produces a buzz - long for a raised dot, short for a flat one -
  * so letters that differ only by a leading blank dot (I/K, J/M, S/L...) stay distinguishable.
  * Returns [] for a space and null for characters with no Braille mapping.
  */
 export const charToVibrationPattern = (char: string): number[] | null => {
   const dots = BRAILLE_MAP[char.toUpperCase()];
   if (dots === undefined) return null;
   if (dots.length === 0) return [];
 
   const pattern: number[] = [];
   for (let pos = 1; pos <= 6; pos++) {
     if (pos > 1) pattern.push(SLOT_GAP);
     pattern.push(dots.includes(pos) ? DOT_PRESENT : DOT_ABSENT);
   }
   return pattern;
 };
 
 /**
  * Calculate total duration of a vibration pattern
  */
 const calculatePatternDuration = (pattern: number[]): number => {
   return pattern.reduce((sum, val) => sum + val, 0);
 };
 
 export const useHapticBraille = () => {
   const [isPlaying, setIsPlaying] = useState(false);
   const [currentChar, setCurrentChar] = useState<string | null>(null);
   const [currentDots, setCurrentDots] = useState<number[]>([]);
   const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   // Resolver for the in-flight wait, so stopping doesn't leave the playback promise pending forever
   const pendingResolveRef = useRef<(() => void) | null>(null);
   // Incremented on every stop/start; a playback loop exits when its run id is no longer current
   const runIdRef = useRef(0);
 
   const cancelPending = useCallback(() => {
     runIdRef.current += 1;
     if (timeoutRef.current) {
       clearTimeout(timeoutRef.current);
       timeoutRef.current = null;
     }
     const resolve = pendingResolveRef.current;
     pendingResolveRef.current = null;
     if (resolve) resolve();
     if ("vibrate" in navigator) {
       try { navigator.vibrate(0); } catch { /* vibration unsupported */ } // Stop any ongoing vibration
     }
   }, []);
 
   const stopHaptic = useCallback(() => {
     cancelPending();
     setIsPlaying(false);
     setCurrentChar(null);
     setCurrentDots([]);
   }, [cancelPending]);
 
   const playHapticMessage = useCallback(async (text: string): Promise<void> => {
     if (!("vibrate" in navigator)) {
       console.warn("Vibration API not supported");
       return;
     }
 
     // Stop any existing playback
     stopHaptic();
     const runId = runIdRef.current;
     setIsPlaying(true);
 
     const upperText = text.toUpperCase();
 
     // Play each character sequentially
     for (let i = 0; i < upperText.length; i++) {
       if (runIdRef.current !== runId) break;
 
       const char = upperText[i];
       const dots = BRAILLE_MAP[char];
 
       if (dots !== undefined) {
         setCurrentChar(char);
         setCurrentDots(dots);
 
         const pattern = charToVibrationPattern(char) ?? [];
         const duration = calculatePatternDuration(pattern);
         // A space has no buzzes, just a longer pause
         const separator = pattern.length === 0 ? WORD_SEPARATOR : CHAR_SEPARATOR;
 
         if (pattern.length > 0) {
           try {
             navigator.vibrate(pattern);
           } catch (e) {
             console.warn("Vibration failed:", e);
           }
         }
 
         // Wait for pattern to complete + character/word separator
         await new Promise<void>((resolve) => {
           pendingResolveRef.current = resolve;
           timeoutRef.current = setTimeout(() => {
             pendingResolveRef.current = null;
             resolve();
           }, duration + separator);
         });
       }
     }
 
     if (runIdRef.current === runId) {
       setIsPlaying(false);
       setCurrentChar(null);
       setCurrentDots([]);
     }
   }, [stopHaptic]);
 
   // Cancel any in-progress playback on unmount
   useEffect(() => cancelPending, [cancelPending]);
 
   return {
     playHapticMessage,
     stopHaptic,
     isPlaying,
     currentChar,
     currentDots,
   };
 };