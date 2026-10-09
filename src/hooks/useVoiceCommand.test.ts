import { describe, expect, it } from "vitest";
import { isReaderCommand } from "./useVoiceCommand";

describe("isReaderCommand (hands-free)", () => {
  it.each(["neuro read", "neuro read this", "neural read", "nero read the sign", "neuro, read", "neuro reader"])(
    "matches '%s'",
    (transcript) => {
      expect(isReaderCommand(transcript)).toBe(true);
    },
  );

  it.each(["neuro ready", "read this", "neuro describe", "neuro remember ronit"])(
    "ignores '%s'",
    (transcript) => {
      expect(isReaderCommand(transcript)).toBe(false);
    },
  );
});
