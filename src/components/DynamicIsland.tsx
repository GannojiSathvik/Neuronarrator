import { cn } from "@/lib/utils";
import { type CommandMode } from "@/hooks/useVoiceControl";

interface DynamicIslandProps {
  status: "idle" | "analyzing" | "success" | "warning" | "error";
  priority?: number;
  commandMode?: CommandMode;
}

export const DynamicIsland = ({ status, priority = 0, commandMode = "standard" }: DynamicIslandProps) => {
  const isHighPriority = priority > 7;

  const getStatusDotClass = () => {
    switch (status) {
      case "warning":
        return "bg-ios-red status-analyzing";
      case "error":
        return "bg-ios-red";
      case "analyzing":
        return "bg-ios-blue status-analyzing";
      case "success":
        if (isHighPriority) return "bg-ios-red status-analyzing";
        if (commandMode === "currency") return "bg-ios-green";
        if (commandMode === "finder") return "bg-yellow-400";
        if (commandMode === "reader") return "bg-ios-purple";
        return "bg-ios-blue";
      default:
        return "bg-ios-green";
    }
  };

  const getStatusTextClass = () => {
    switch (status) {
      case "warning":
      case "error":
        return "text-ios-red";
      case "analyzing":
        return "text-ios-blue";
      case "success":
        if (isHighPriority) return "text-ios-red";
        if (commandMode === "currency") return "text-ios-green";
        if (commandMode === "finder") return "text-yellow-400";
        if (commandMode === "reader") return "text-ios-purple";
        return "text-ios-blue";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "warning":
        return "⚠ Hazard Detected";
      case "error":
        return "⚠ System Error";
      case "analyzing":
        if (commandMode === "currency") return "Reading Currency...";
        if (commandMode === "finder") return "Searching...";
        if (commandMode === "reader") return "Reading Text...";
        return "Analyzing Scene...";
      case "success":
        if (isHighPriority) return "⚠ High Priority Alert";
        if (commandMode === "currency") return "💰 Currency Detected";
        if (commandMode === "finder") return "🔍 Item Finder";
        if (commandMode === "reader") return "📖 Text Read";
        return "Analysis Complete";
      default:
        return "Ready";
    }
  };

  // Mode badge text
  const getModeBadge = () => {
    if (commandMode === "currency") return "💰 CURRENCY";
    if (commandMode === "finder") return "🔍 FINDER";
    if (commandMode === "reader") return "📖 READ";
    return null;
  };

  const modeBadge = getModeBadge();

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Mode badge — always visible when in special mode */}
      {modeBadge && (
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-bold tracking-wider",
          commandMode === "currency" && "bg-ios-green/20 text-ios-green border border-ios-green/40",
          commandMode === "finder" && "bg-yellow-400/20 text-yellow-400 border border-yellow-400/40 animate-pulse",
          commandMode === "reader" && "bg-ios-purple/20 text-ios-purple border border-ios-purple/40",
        )}>
          {modeBadge}
        </div>
      )}
      <div className="dynamic-island shadow-island">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full transition-colors duration-300",
              getStatusDotClass()
            )}
          />
          <span
            className={cn(
              "text-xs font-medium tracking-tight transition-colors duration-300",
              getStatusTextClass()
            )}
          >
            {getStatusText()}
          </span>
        </div>
      </div>
    </div>
  );
};
