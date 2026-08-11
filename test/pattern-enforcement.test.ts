import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { buildPatternFeedback } from "../src/guidance.ts"
import { loadPatterns } from "../src/pattern-catalog.ts"
import { matchesPattern } from "../src/pattern-matcher.ts"
import { actualProjection, snapshotFile } from "../src/write-projection.ts"
import { patterns, requirePattern } from "./helpers/patterns.ts"

const temporaryDirectories: Array<string> = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

const temporaryPattern = async (content: string) => {
  const directory = await mkdtemp(path.join(tmpdir(), "opencode-effect-enforcer-pattern-"))
  temporaryDirectories.push(directory)
  await writeFile(path.join(directory, "pattern.md"), content)
  const [pattern] = await loadPatterns(directory)
  if (pattern === undefined) throw new Error("Temporary pattern did not load")
  return pattern
}

describe("pattern feedback policy", () => {
  it("loads all patterns as post-write advisory feedback", async () => {
    expect(await patterns).toHaveLength(46)
    expect((await patterns).every((pattern) => pattern.event === "after")).toBe(true)
  })

  it("supports full ast-grep rule objects", async () => {
    const pattern = await temporaryPattern([
      "---",
      "tool: (edit|write)",
      "event: after",
      "name: no-wrapped-effect-gen",
      "description: Test full rule support",
      "glob: '**/*.ts'",
      "detector: ast",
      "rule:",
      "  pattern: Effect.gen($$$BODY)",
      "  not:",
      "    inside:",
      "      pattern: Effect.fn($$$)($$$)",
      "      stopBy: end",
      "level: warning",
      "---",
      "Prefer Effect.fn wrappers."
    ].join("\n"))
    expect(matchesPattern(
      "write",
      {
        content: "const bad = Effect.gen(function*() { return 1 })",
        filePath: "src/app.ts"
      },
      "after",
      pattern
    )).toBe(true)
    expect(matchesPattern(
      "write",
      {
        content: "const good = Effect.fn('x')(() => Effect.gen(function*() { return 1 }))",
        filePath: "src/app.ts"
      },
      "after",
      pattern
    )).toBe(false)
  })

  it("honors ignoreGlob entries", async () => {
    const pattern = await temporaryPattern([
      "---",
      "tool: (edit|write)",
      "event: after",
      "name: no-console-except-fixtures",
      "description: Test ignoreGlob",
      "glob: '**/*.ts'",
      "ignoreGlob:",
      "  - '**/*.fixture.ts'",
      "detector: ast",
      "pattern: console.$M($$$)",
      "level: warning",
      "---",
      "No console calls."
    ].join("\n"))
    expect(
      matchesPattern(
        "write",
        { content: 'console.log("x")', filePath: "src/app.ts" },
        "after",
        pattern
      )
    ).toBe(true)
    expect(
      matchesPattern(
        "write",
        { content: 'console.log("x")', filePath: "src/app.fixture.ts" },
        "after",
        pattern
      )
    ).toBe(false)
  })

  it("sorts findings and permits intentional exceptions", async () => {
    const message = buildPatternFeedback([
      await requirePattern("avoid-any"),
      await requirePattern("avoid-react-hooks"),
      await requirePattern("throw-in-effect-gen")
    ], "src/example.ts")
    expect(message).toContain("opencode-effect-enforcer review request:")
    expect(message).toContain("false positive or intentional exception")
    expect(message.indexOf("throw-in-effect-gen")).toBeLessThan(
      message.indexOf("avoid-react-hooks")
    )
    expect(message.indexOf("avoid-react-hooks")).toBeLessThan(message.indexOf("avoid-any"))
  })

  it("matches only newly added violations after an edit", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "opencode-effect-enforcer-write-"))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, "app.ts")
    await writeFile(filePath, "import * as fs from 'node:fs';\nexport const value = 1;\n")
    const snapshot = await snapshotFile(directory, filePath)
    await writeFile(
      filePath,
      "import * as fs from 'node:fs';\nimport * as stream from 'node:stream';\nexport const value = 2;\n"
    )
    const projection = await actualProjection(snapshot)
    if (projection === undefined) throw new Error("Expected final projection")
    const pattern = await requirePattern("avoid-node-imports")
    expect(matchesPattern("edit", projection, "after", pattern)).toBe(true)

    const unchanged = {
      ...projection,
      changedSpans: [{
        start: projection.content.indexOf("value = 2"),
        end: projection.content.length
      }]
    }
    expect(matchesPattern("edit", unchanged, "after", pattern)).toBe(false)
  })
})
