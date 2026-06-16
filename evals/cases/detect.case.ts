import { describe, expect, it } from "vitest";
import { heuristicDetect, parseDetection, type DetectTarget } from "@/lib/core/detect";
import { JsonArrayParseError } from "@/lib/core/json";
import {
  DETECT_ABSENT,
  DETECT_CLEAR,
  DETECT_FENCED,
  DETECT_MALFORMED,
} from "../fixtures/detection-responses";

const TARGETS: DetectTarget[] = [
  { key: "subject", targetType: "subject", targetId: "s1", name: "Ada Lovelace", aliases: [] },
  { key: "comp-1", targetType: "competitor", targetId: "c1", name: "Charles Babbage", aliases: [] },
];

describe("parseDetection — mapping & disambiguation faithfulness", () => {
  it("maps a clear detection response onto targets", () => {
    const results = parseDetection(DETECT_CLEAR, TARGETS);
    const subj = results.find((r) => r.targetType === "subject")!;
    const comp = results.find((r) => r.targetType === "competitor")!;
    expect(subj).toMatchObject({ targetId: "s1", mentioned: true, position: 1, sentiment: "positive", method: "model" });
    expect(comp).toMatchObject({ targetId: "c1", mentioned: true, position: 2 });
    expect(subj.confidence).toBeGreaterThan(0.5);
  });

  it("respects a name-collision 'not this entity' verdict", () => {
    const results = parseDetection(DETECT_ABSENT, TARGETS);
    expect(results.every((r) => r.mentioned === false)).toBe(true);
    expect(results.every((r) => r.position === null)).toBe(true);
  });

  it("recovers from a fenced + prose-wrapped response", () => {
    const subj = parseDetection(DETECT_FENCED, TARGETS).find((r) => r.targetType === "subject")!;
    expect(subj.mentioned).toBe(true);
  });

  it("throws JsonArrayParseError on output with no array (so the caller retries)", () => {
    expect(() => parseDetection(DETECT_MALFORMED, TARGETS)).toThrow(JsonArrayParseError);
  });

  it("defaults a target to not-mentioned when the model omits it", () => {
    const raw = JSON.stringify([{ key: "subject", mentioned: true, position: 1 }]);
    const comp = parseDetection(raw, TARGETS).find((r) => r.targetType === "competitor")!;
    expect(comp.mentioned).toBe(false);
  });
});

describe("heuristicDetect — keyless fallback", () => {
  it("detects clear mentions and orders position by first occurrence", () => {
    const text = "Ada Lovelace pioneered programming; later Charles Babbage built the engine.";
    const results = heuristicDetect(text, TARGETS);
    const subj = results.find((r) => r.targetType === "subject")!;
    const comp = results.find((r) => r.targetType === "competitor")!;
    expect(subj).toMatchObject({ mentioned: true, position: 1, method: "heuristic" });
    expect(comp).toMatchObject({ mentioned: true, position: 2 });
  });

  it("reports not-mentioned when absent", () => {
    const results = heuristicDetect("Grace Hopper was a computing pioneer.", TARGETS);
    expect(results.every((r) => r.mentioned === false)).toBe(true);
  });

  it("uses word boundaries (no partial-name false positives)", () => {
    const targets: DetectTarget[] = [
      { key: "subject", targetType: "subject", targetId: "s1", name: "Ada", aliases: [] },
    ];
    const results = heuristicDetect("Adamant tools are great for adamantine work.", targets);
    expect(results[0].mentioned).toBe(false);
  });
});
