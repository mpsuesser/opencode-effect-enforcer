import { describe, expect, it } from "vitest"

import { matchesPattern, stripComments } from "../src/pattern-matcher.ts"
import { Pattern } from "../src/pattern.ts"
import { requirePattern } from "./helpers/patterns.ts"

describe("stripComments", () => {
  it.each([
    ["code // comment\nmore", "code           \nmore"],
    ["a /* block */ b", "a             b"],
    ["a /* line1\nline2 */ b", "a         \n         b"],
    ["/** docs */\ncode", "           \ncode"]
  ])("blanks comments while preserving offsets", (source, expected) => {
    expect(stripComments(source)).toBe(expected)
  })

  it.each([
    "import fs from 'node:fs';",
    'import fs from "node:fs";',
    "const x = `hello`;",
    "const url = 'https://example.com';",
    "const re = '/* not a comment */';",
    "const s = 'it\\'s fine';"
  ])("preserves strings: %s", (source) => {
    expect(stripComments(source)).toBe(source)
  })
})

describe("comment matching policy", () => {
  it.each([
    ["casting-awareness", "// used as a fallback\nconst x = 5;"],
    ["avoid-mutable-state", "// do not let errors escape\nconst x = 5;"],
    ["avoid-try-catch", "/* try { something() } */\nconst x = 5;"],
    ["avoid-direct-json", "/* replace JSON.parse(raw) */\nconst x = 5;"],
    ["use-console-service", "// console.log(value)\nconst x = 5;"]
  ])("ignores %s triggers found only in comments", async (name, content) => {
    const pattern = await requirePattern(name)
    expect(matchesPattern("write", { content, filePath: "src/app.ts" }, pattern.event, pattern))
      .toBe(false)
  })

  it("honors matchInComments for TypeScript suppression comments", async () => {
    const pattern = await requirePattern("avoid-ts-ignore")
    expect(pattern.detector).toBeInstanceOf(Pattern.RegexDetector)
    expect(matchesPattern(
      "write",
      { content: "// @ts-ignore\nconst value = 1", filePath: "src/app.ts" },
      pattern.event,
      pattern
    )).toBe(true)
  })
})
