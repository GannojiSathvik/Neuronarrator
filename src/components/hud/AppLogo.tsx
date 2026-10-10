import { Link } from "react-router-dom";

/** Bottom-left round "N" logo. It is also the way back to the Memory space. */
export function AppLogo() {
  return (
    <Link
      to="/"
      aria-label="NeuroNarrator: open Memory space"
      title="Memory space"
      className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/75 text-[0.875rem] font-bold text-white shadow-lg backdrop-blur-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      N
    </Link>
  );
}
