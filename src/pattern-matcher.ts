import { Lang, type NapiConfig, parse, type Rule as AstGrepRuleDefinition } from "@ast-grep/napi"
import picomatch from "picomatch"

import { type MatcherInput, Pattern, type Span } from "./pattern.ts"

/** Blank JavaScript comments while preserving source offsets, strings, and line breaks. */
export const stripComments = (source: string): string => {
  const output: Array<string> = []
  let index = 0
  const at = (current: number) => source.charAt(current)
  const keep = () => {
    output.push(at(index))
    index += 1
  }
  const blank = () => {
    output.push(at(index) === "\n" ? "\n" : " ")
    index += 1
  }

  while (index < source.length) {
    const current = at(index)
    const next = at(index + 1)
    if (current === "'" || current === '"') {
      const quote = current
      keep()
      while (index < source.length && at(index) !== quote) {
        if (at(index) === "\\" && index + 1 < source.length) keep()
        keep()
      }
      if (index < source.length) keep()
      continue
    }
    if (current === "`") {
      keep()
      while (index < source.length && at(index) !== "`") {
        if (at(index) === "\\" && index + 1 < source.length) keep()
        keep()
      }
      if (index < source.length) keep()
      continue
    }
    if (current === "/" && next === "/") {
      blank()
      blank()
      while (index < source.length && at(index) !== "\n") blank()
      continue
    }
    if (current === "/" && next === "*") {
      blank()
      blank()
      while (index < source.length) {
        if (at(index) === "*" && at(index + 1) === "/") {
          blank()
          blank()
          break
        }
        blank()
      }
      continue
    }
    keep()
  }
  return output.join("")
}

const location = (source: string, start: number, end: number): Pattern.MatchLocation => {
  const before = source.slice(0, start)
  const previousBreak = before.lastIndexOf("\n")
  return new Pattern.MatchLocation({
    start,
    end,
    line: before.split("\n").length,
    column: start - (previousBreak === -1 ? 0 : previousBreak + 1) + 1,
    snippet: (source.slice(start, end).split("\n")[0] ?? "").trim()
  })
}

const language = (filePath: string): Lang | undefined => {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) return Lang.Tsx
  if (filePath.endsWith(".ts")) return Lang.TypeScript
  if (filePath.endsWith(".js")) return Lang.JavaScript
  return undefined
}

const astLocations = (
  detector: Pattern.AstDetector,
  source: string,
  filePath: string | undefined
): ReadonlyArray<Pattern.MatchLocation> => {
  if (filePath === undefined) return []
  const lang = language(filePath)
  if (lang === undefined) return []
  try {
    const root = parse(lang, source).root()
    const find = (matcher: string | NapiConfig) =>
      root.findAll(matcher).map((node) =>
        location(source, node.range().start.index, node.range().end.index)
      )
    const legacy = detector.patterns.flatMap((candidate) =>
      find(
        detector.inside === undefined ? candidate : {
          rule: { pattern: candidate, inside: { pattern: detector.inside, stopBy: "end" } }
        }
      )
    )
    const rules = (detector.rules ?? []).flatMap((rule: AstGrepRuleDefinition) =>
      find(
        detector.constraints === undefined
          ? { rule }
          : { rule, constraints: detector.constraints }
      )
    )
    return [...legacy, ...rules]
  } catch {
    return []
  }
}

const regexLocations = (
  detector: Pattern.RegexDetector,
  source: string
): ReadonlyArray<Pattern.MatchLocation> => {
  const matchSource = detector.matchInComments ? source : stripComments(source)
  try {
    const regex = new RegExp(detector.pattern, "g")
    return [...matchSource.matchAll(regex)].flatMap((match) =>
      match.index === undefined || match[0].length === 0
        ? []
        : [location(source, match.index, match.index + match[0].length)]
    )
  } catch {
    return []
  }
}

const intersects = (left: Span, right: Span): boolean =>
  left.start < right.end && right.start < left.end

/** Find detector matches that satisfy event, tool, path, and changed-span constraints. */
export const findPatternMatches = (
  toolName: string,
  input: MatcherInput,
  event: "before" | "after",
  pattern: Pattern.Value
): ReadonlyArray<Pattern.MatchLocation> => {
  try {
    if (pattern.event !== event || !new RegExp(pattern.toolRegex).test(toolName)) return []
    if (
      pattern.glob !== undefined
      && (input.filePath === undefined || !picomatch(pattern.glob)(input.filePath))
    ) return []
    const filePath = input.filePath
    if (
      filePath !== undefined
      && pattern.ignoreGlob?.some((glob) => picomatch(glob)(filePath)) === true
    ) {
      return []
    }
  } catch {
    return []
  }
  const matches = pattern.detector instanceof Pattern.AstDetector
    ? astLocations(pattern.detector, input.content, input.filePath)
    : regexLocations(pattern.detector, input.content)
  return input.changedSpans === undefined
    ? matches
    : matches.filter((match) =>
      input.changedSpans?.some((span) => intersects(match, span)) === true
    )
}

/** Determine whether a pattern matches normalized input. */
export const matchesPattern = (
  toolName: string,
  input: MatcherInput,
  event: "before" | "after",
  pattern: Pattern.Value
): boolean => findPatternMatches(toolName, input, event, pattern).length > 0
