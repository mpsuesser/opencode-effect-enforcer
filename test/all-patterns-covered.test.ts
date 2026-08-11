import { readdir } from "node:fs/promises"
import { describe, expect, it } from "vitest"

import { patterns } from "./helpers/patterns.ts"

const INFRASTRUCTURE_TESTS = new Set([
  "all-patterns-covered.test.ts",
  "comment-string-false-positives.test.ts",
  "pattern-enforcement.test.ts",
  "skills-runtime.test.ts",
  "write-projection.test.ts"
])

describe("pattern-to-test coverage", () => {
  it("keeps a one-to-one pattern and detector-test inventory", async () => {
    const patternNames = (await patterns).map((pattern) => pattern.name).toSorted()
    const testNames = (await readdir(import.meta.dirname))
      .filter((name) => name.endsWith(".test.ts") && !INFRASTRUCTURE_TESTS.has(name))
      .map((name) => name.replace(/\.test\.ts$/, ""))
      .toSorted()
    expect(testNames).toEqual(patternNames)
    expect(patternNames).toHaveLength(46)
  })
})
