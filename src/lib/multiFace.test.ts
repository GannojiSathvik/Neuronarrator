import { describe, expect, it } from "vitest";
import {
  joinReminders,
  pickReminderPeople,
  toKnownFaces,
  unknownFaceCaption,
  unknownFacePrompt,
} from "./multiFace";

const person = (id: number, name: string) => ({
  known: true,
  id,
  context: { name, relation: "Friend", daysSinceLastSeen: 1, isLongAbsence: false },
});

describe("toKnownFaces", () => {
  it("sends every recognised person and skips strangers", () => {
    const faces = toKnownFaces([person(1, "Asha"), { known: false }, person(2, "Ronit")]);
    expect(faces.map((face) => face.name)).toEqual(["Asha", "Ronit"]);
    expect(faces[0]).toEqual({ name: "Asha", relation: "Friend", daysSinceLastSeen: 1, isLongAbsence: false });
  });
});

describe("unknown-face wording", () => {
  it("keeps the single-stranger prompt", () => {
    expect(unknownFacePrompt(1)).toBe(
      "There's someone I don't know in front of you. To save them, say neuro remember and their name.",
    );
  });

  it("counts several strangers in words", () => {
    expect(unknownFacePrompt(2)).toMatch(/^There are two people I don't know/);
    expect(unknownFacePrompt(3)).toMatch(/three people/);
    expect(unknownFaceCaption(2)).toMatch(/^2 unknown faces/);
    expect(unknownFaceCaption(1)).toMatch(/^Unknown face detected/);
  });
});

describe("pickReminderPeople", () => {
  it("looks up at most two new people per cycle, most prominent first", () => {
    expect(pickReminderPeople([5, 6, 7], new Map())).toEqual({ lookup: [5, 6], refresh: [] });
  });

  it("only refreshes people already reminded this appearance", () => {
    const announced = new Map([[5, 1_000]]);
    expect(pickReminderPeople([5, 6, 7], announced)).toEqual({ lookup: [6, 7], refresh: [5] });
  });

  it("ignores a repeated id", () => {
    expect(pickReminderPeople([5, 5], new Map())).toEqual({ lookup: [5], refresh: [] });
  });
});

describe("joinReminders", () => {
  const reminders = [
    { name: "Asha", sentence: "Last time: coffee on Sunday." },
    { name: "Ronit", sentence: "" },
    { name: "Jake", sentence: "Last time: the hike." },
  ];

  it("says whose note it is when several people are in view", () => {
    expect(joinReminders(reminders, true)).toBe("Asha. Last time: coffee on Sunday. Jake. Last time: the hike.");
  });

  it("keeps the plain note for one person", () => {
    expect(joinReminders([reminders[0]], false)).toBe("Last time: coffee on Sunday.");
  });
});
