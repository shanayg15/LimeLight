import { describe, expect, it } from "vitest";

/**
 * The eval harness entry. Every `*.case.ts` under `evals/cases/` is also picked
 * up directly by Vitest (see `include` in vitest.config.ts), so dropping in a
 * new case file (M2+) wires it into `pnpm test` automatically.
 *
 * Cases run deterministically against saved fixtures in `evals/fixtures/`
 * (real captured model responses), so detection/extraction/scoring logic is
 * tested for free, independent of live API noise. This file is the trivial
 * boot check that keeps the suite non-empty before any cases exist.
 */
describe("eval harness", () => {
  it("boots", () => {
    expect(true).toBe(true);
  });
});
