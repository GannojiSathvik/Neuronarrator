import { useEffect, useState } from "react";
import type { Size } from "@/lib/facePlacement";

const read = (): Size => ({ width: window.innerWidth, height: window.innerHeight });

/** The viewport size, updated on resize and rotation. */
export function useScreenSize(): Size {
  const [screen, setScreen] = useState<Size>(read);
  useEffect(() => {
    const onResize = () => setScreen(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return screen;
}
