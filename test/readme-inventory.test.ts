import { readdir, readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const readme = readFile(new URL("../README.md", import.meta.url), "utf8")

const linkedExactlyOnce = (content: string, path: string): void => {
  expect(content.split(`](${path})`)).toHaveLength(2)
}

describe("README source catalog", () => {
  it("links every bundled skill, pattern, and guidance document exactly once", async () => {
    const [content, skillDirectories, patternFiles, guidanceFiles] = await Promise.all([
      readme,
      readdir(new URL("../skills", import.meta.url)),
      readdir(new URL("../patterns", import.meta.url)),
      readdir(new URL("../guidance", import.meta.url))
    ])

    const skillPaths = skillDirectories.map((name) => `skills/${name}/SKILL.md`)
    const patternPaths = patternFiles
      .filter((name) => name.endsWith(".md"))
      .map((name) => `patterns/${name}`)
    const guidancePaths = guidanceFiles
      .filter((name) => name.endsWith(".md"))
      .map((name) => `guidance/${name}`)

    expect(skillPaths).toHaveLength(53)
    expect(patternPaths).toHaveLength(45)
    expect(guidancePaths).toHaveLength(4)

    const documentedPaths = [...skillPaths, ...patternPaths, ...guidancePaths]
    documentedPaths.forEach((path) => {
      linkedExactlyOnce(content, path)
    })
  })
})
