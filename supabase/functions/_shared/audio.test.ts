import { describe, expect, it } from "vitest";
import { audioUpload, whisperLanguage } from "./audio";

describe("audioUpload", () => {
  it.each([
    ["audio/webm;codecs=opus", "audio/webm", "recording.webm"],
    ["audio/mp4", "audio/mp4", "recording.mp4"],
    ["audio/x-m4a", "audio/x-m4a", "recording.m4a"],
    ["audio/ogg; codecs=opus", "audio/ogg", "recording.ogg"],
    ["audio/wav", "audio/wav", "recording.wav"],
    ["AUDIO/MPEG", "audio/mpeg", "recording.mp3"],
  ])("labels %s as %s / %s", (mime, mimeType, fileName) => {
    expect(audioUpload(mime)).toEqual({ mimeType, fileName });
  });

  it("rejects types it can't label", () => {
    expect(audioUpload("text/plain")).toBeNull();
    expect(audioUpload("")).toBeNull();
  });
});

describe("whisperLanguage", () => {
  it("turns a locale into an ISO-639-1 code", () => {
    expect(whisperLanguage("en-IN")).toBe("en");
    expect(whisperLanguage("hi-IN")).toBe("hi");
  });
});
