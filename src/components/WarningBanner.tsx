 import { AlertTriangle } from "lucide-react";
 
 interface WarningBannerProps {
   isVisible: boolean;
 }
 
 export const WarningBanner = ({ isVisible }: WarningBannerProps) => {
   if (!isVisible) return null;
 
   return (
     <div role="alert" aria-live="assertive" className="fixed top-0 left-0 right-0 z-40 animate-in slide-in-from-top duration-300">
       <div className="bg-ios-red py-4 px-6">
         <div className="flex items-center justify-center gap-3">
           <AlertTriangle className="w-8 h-8 text-foreground animate-pulse" />
           <span className="text-2xl font-bold text-foreground tracking-tight">
             WARNING
           </span>
           <AlertTriangle className="w-8 h-8 text-foreground animate-pulse" />
         </div>
       </div>
     </div>
   );
 };