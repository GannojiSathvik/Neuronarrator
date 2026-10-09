import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Loader2, Users, Mic, MicOff, AudioLines } from "lucide-react";
import { RELATION_OPTIONS, type RelationType } from "@/lib/faceDatabase";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";

interface AddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, relation: RelationType) => Promise<boolean>;
  isProcessing?: boolean;
  initialName?: string;
  initialRelation?: RelationType;
  existingPerson?: boolean;
}

export const AddPersonModal = ({
  isOpen,
  onClose,
  onSave,
  isProcessing = false,
  initialName = '',
  initialRelation = 'Acquaintance',
  existingPerson = false,
}: AddPersonModalProps) => {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<RelationType>("Acquaintance");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    if (isOpen) { setName(initialName); setRelation(initialRelation); setConsent(false); setError(''); }
  }, [isOpen, initialName, initialRelation]);

  const {
    isRecording,
    isTranscribing,
    transcript,
    error: voiceError,
    startRecording,
    stopRecording,
    reset: resetVoice,
  } = useVoiceInput();

  // When transcript arrives, auto-fill the name field
  useEffect(() => {
    if (transcript && !existingPerson) {
      // Clean up transcript - capitalize first letter of each word
      const cleanName = transcript
        .replace(/[.!?,;:]/g, "")
        .trim()
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      setName(cleanName);
    }
  }, [transcript, existingPerson]);

  const handleVoiceToggle = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleSave = async () => {
    if (!consent || isSaving) return;
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Please enter a name");
      return;
    }

    if (trimmedName.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const success = await onSave(trimmedName, relation);
      if (success) {
        setName("");
        setRelation("Acquaintance");
        resetVoice();
        onClose();
      } else {
        setError("Failed to save face. Please try again.");
      }
    } catch (err) {
      setError("An error occurred while saving");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setName("");
    setRelation("Acquaintance");
    setError("");
    resetVoice();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSaving) {
      handleSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md bg-surface/95 backdrop-blur-xl border-glass-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <UserPlus className="w-5 h-5 text-ios-blue" />
            {existingPerson ? `Connect a face to ${initialName}` : 'Who is this?'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Confirm who is in front of the camera. The face descriptor is saved in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Voice Input Section */}
          {!existingPerson && <div className="flex flex-col items-center gap-3 py-2">
            <button
              onClick={handleVoiceToggle}
              disabled={isTranscribing || isSaving}
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300",
                isRecording
                  ? "bg-ios-red text-white animate-pulse scale-110 shadow-lg shadow-ios-red/40"
                  : isTranscribing
                  ? "bg-ios-orange/20 text-ios-orange"
                  : "bg-ios-blue/15 text-ios-blue hover:bg-ios-blue/25 active:scale-95"
              )}
              aria-label={isRecording ? "Stop recording" : "Start voice input"}
            >
              {isTranscribing ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : isRecording ? (
                <AudioLines className="w-7 h-7" />
              ) : (
                <Mic className="w-7 h-7" />
              )}
            </button>
            <p className="text-xs text-muted-foreground text-center">
              {isRecording
                ? "Listening... tap to stop"
                : isTranscribing
                ? "Recognizing speech..."
                : "Tap mic & say the name"}
            </p>
            {voiceError && (
              <p className="text-xs text-ios-red text-center">{voiceError}</p>
            )}
          </div>}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-glass-border" />
            <span className="text-xs text-muted-foreground">or type</span>
            <div className="flex-1 h-px bg-glass-border" />
          </div>

          {/* Name Input */}
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-foreground">
              Name
            </Label>
            <Input
              id="name"
              placeholder="Enter person's name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSaving || isRecording || existingPerson}
              maxLength={80}
              className="bg-background/50 border-glass-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Relationship Dropdown */}
          <div className="grid gap-2">
            <Label
              htmlFor="relation"
              className="text-foreground flex items-center gap-2"
            >
              <Users className="w-4 h-4 text-muted-foreground" />
              Relationship
            </Label>
            <Select
              value={relation}
              onValueChange={(value) => setRelation(value as RelationType)}
              disabled={isSaving || existingPerson}
            >
              <SelectTrigger
                id="relation"
                className="bg-background/50 border-glass-border text-foreground"
              >
                <SelectValue placeholder="Select relationship..." />
              </SelectTrigger>
              <SelectContent className="bg-surface border-glass-border z-[100]">
                {RELATION_OPTIONS.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    className="text-foreground hover:bg-accent focus:bg-accent"
                  >
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex gap-3 items-start text-sm text-muted-foreground"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1" />This person agrees to saving their face for local recognition.</label>
          {error && <p role="alert" className="text-sm text-ios-red">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
            className="border-glass-border text-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !name.trim() || isRecording || isTranscribing || !consent}
            className="bg-ios-blue hover:bg-ios-blue/90 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Face"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
