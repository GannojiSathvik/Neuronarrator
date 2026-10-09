 import { X } from "lucide-react";
 import { Switch } from "@/components/ui/switch";
 
 interface SettingsModalProps {
   isOpen: boolean;
   onClose: () => void;
   autoDescribe: boolean;
   onAutoDescribeChange: (enabled: boolean) => void;
 }
 
 export const SettingsModal = ({ isOpen, onClose, autoDescribe, onAutoDescribeChange }: SettingsModalProps) => {
   if (!isOpen) return null;
 
   return (
     <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
       {/* Backdrop */}
       <div
         className="absolute inset-0 bg-background/80 backdrop-blur-sm"
         onClick={onClose}
       />
 
       {/* Modal */}
       <div className="relative w-full max-w-sm glass-panel super-ellipse-sm p-6 animate-in fade-in zoom-in-95 duration-200">
         {/* Header */}
         <div className="flex items-center justify-between mb-6">
           <h2 className="text-lg font-semibold text-foreground">Settings</h2>
           <button
             onClick={onClose}
             className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center hover:bg-surface transition-colors"
           >
             <X className="w-4 h-4 text-muted-foreground" />
           </button>
         </div>
 
         {/* Info Section */}
         <div className="space-y-4">
           <div className="text-center py-6">
             <div className="w-12 h-12 rounded-full bg-ios-green/20 flex items-center justify-center mx-auto mb-4">
               <span className="text-2xl">✓</span>
             </div>
             <h3 className="text-foreground font-medium mb-2">Ready to Use</h3>
             <p className="text-sm text-muted-foreground">
               NeuroNarrator is configured and ready. Vision analysis is powered by Lovable Cloud.
             </p>
           </div>
 
           {/* Auto-describe: off = describe only when asked (Describe button, "neuro describe") */}
           <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-elevated px-4 py-3">
             <div>
               <label htmlFor="auto-describe" className="text-sm font-medium text-foreground">
                 Auto-describe
               </label>
               <p id="auto-describe-help" className="text-xs text-muted-foreground">
                 Keep describing the scene on its own. Off: only when you tap Describe or say "neuro describe".
               </p>
             </div>
             <Switch
               id="auto-describe"
               checked={autoDescribe}
               onCheckedChange={onAutoDescribeChange}
               aria-describedby="auto-describe-help"
             />
           </div>
 
           <div className="pt-2">
             <button
               onClick={onClose}
               className="w-full h-11 rounded-xl bg-ios-blue text-foreground font-medium text-sm hover:opacity-90 transition-opacity"
             >
               Done
             </button>
           </div>
         </div>
       </div>
     </div>
   );
 };