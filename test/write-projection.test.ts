import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  actualProjection,
  changedSpans,
  relativeToolPath,
  snapshotFile
} from "../src/write-projection.ts"

describe("write projection", () => {
  it("computes only added spans in final-output coordinates", () => {
    const before = "const a = 1\nconst b = 2\n"
    const after = "const a = 1\nconst b = 20\nconst c = 3\n"
    const spans = changedSpans(before, after)
    expect(spans.map((span) => after.slice(span.start, span.end)).join("")).toContain(
      "const b = 20"
    )
    expect(spans.map((span) => after.slice(span.start, span.end)).join("")).toContain(
      "const c = 3"
    )
    expect(spans.every((span) => !after.slice(span.start, span.end).includes("const a = 1")))
      .toBe(true)
  })

  it("treats a new file as entirely changed", () => {
    expect(changedSpans(undefined, "abc")).toEqual([{ start: 0, end: 3 }])
  })

  it("reads the actual formatted output after a successful write", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "opencode-effect-enforcer-projection-"))
    try {
      const filePath = path.join(directory, "src", "app.ts")
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, "export const value = 1\n")
      const snapshot = await snapshotFile(directory, filePath)
      await writeFile(filePath, "export const value = 2\n")
      const projection = await actualProjection(snapshot)
      expect(projection?.content).toBe("export const value = 2\n")
      expect(projection?.filePath).toBe("src/app.ts")
      expect(relativeToolPath(directory, filePath)).toBe("src/app.ts")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
