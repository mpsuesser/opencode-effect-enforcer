import { Lang, parse } from "@ast-grep/napi"
import { describe, expect, it } from "vitest"

import { matchesPattern, stripComments } from "../../src/pattern-matcher.ts"
import { Pattern } from "../../src/pattern.ts"
import { requirePattern } from "./patterns.ts"

interface TestPatternOptions {
  readonly name: string
  readonly tag?: string
  readonly glob?: string
  readonly shouldMatch: ReadonlyArray<string>
  readonly shouldNotMatch: ReadonlyArray<string>
}

const preview = (value: string): string => value.replaceAll("\n", "\\n").slice(0, 80)

const matchesDetector = (pattern: Pattern.Value, input: string): boolean => {
  if (pattern.detector instanceof Pattern.AstDetector) {
    const detector = pattern.detector
    const root = parse(Lang.TypeScript, input).root()
    return detector.patterns.some((candidate) =>
      root.findAll(
        detector.inside === undefined ? candidate : {
          rule: { pattern: candidate, inside: { pattern: detector.inside, stopBy: "end" } }
        }
      ).length > 0
    ) || (detector.rules ?? []).some((rule) =>
      root.findAll(
        detector.constraints === undefined
          ? { rule }
          : { rule, constraints: detector.constraints }
      ).length > 0
    )
  }
  const source = pattern.detector.matchInComments ? input : stripComments(input)
  return new RegExp(pattern.detector.pattern).test(source)
}

/** Register the copied positive and negative detector cases for one pattern. */
export const testPattern = (options: TestPatternOptions): void => {
  describe(`Pattern: ${options.name}`, () => {
    it("loads its pattern definition", async () => {
      expect((await requirePattern(options.name)).name).toBe(options.name)
    })
    for (const input of options.shouldMatch) {
      it(`matches: ${preview(input)}`, async () => {
        expect(matchesDetector(await requirePattern(options.name), input)).toBe(true)
      })
    }
    for (const input of options.shouldNotMatch) {
      it(`does not match: ${preview(input)}`, async () => {
        expect(matchesDetector(await requirePattern(options.name), input)).toBe(false)
      })
    }
  })
}

interface TestFilePathPatternOptions {
  readonly name: string
  readonly tag?: string
  readonly shouldMatch: ReadonlyArray<{ readonly code: string; readonly filePath: string }>
  readonly shouldNotMatch: ReadonlyArray<{ readonly code: string; readonly filePath: string }>
}

/** Register full-pipeline cases for a path-sensitive pattern. */
export const testFilePathPattern = (options: TestFilePathPatternOptions): void => {
  describe(`File+Code Pattern: ${options.name}`, () => {
    for (const { code, filePath } of options.shouldMatch) {
      it(`matches ${filePath}: ${preview(code)}`, async () => {
        const pattern = await requirePattern(options.name)
        expect(matchesPattern("write", { content: code, filePath }, pattern.event, pattern))
          .toBe(true)
      })
    }
    for (const { code, filePath } of options.shouldNotMatch) {
      it(`does not match ${filePath}: ${preview(code)}`, async () => {
        const pattern = await requirePattern(options.name)
        expect(matchesPattern("write", { content: code, filePath }, pattern.event, pattern))
          .toBe(false)
      })
    }
  })
}

export { stripComments }
