import type { Rule as AstGrepRuleDefinition } from "@ast-grep/napi"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

import { extractBody, parseFrontmatter } from "./frontmatter.ts"
import { Pattern, type PatternLevel } from "./pattern.ts"

const SKIPPED_FILES = ["CLAUDE", "AGENTS", "GEMINI", "README"]
const LEVELS: ReadonlySet<string> = new Set(["critical", "high", "medium", "warning", "info"])

const string = (value: unknown): string | undefined => typeof value === "string" ? value : undefined
const strings = (value: unknown): ReadonlyArray<string> | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined
const astRule = (value: unknown): value is AstGrepRuleDefinition =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const astRules = (value: unknown): ReadonlyArray<AstGrepRuleDefinition> | undefined => {
  if (astRule(value)) return [value]
  return Array.isArray(value) && value.length > 0 && value.every(astRule) ? value : undefined
}

const astConstraints = (value: unknown): Record<string, AstGrepRuleDefinition> | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const entries = Object.entries(value)
  return entries.every(([, rule]) => astRule(rule))
    ? Object.fromEntries(entries) as Record<string, AstGrepRuleDefinition>
    : undefined
}

const detector = (
  raw: Record<string, unknown>
): Pattern.RegexDetector | Pattern.AstDetector | undefined => {
  if (raw.detector === "ast") {
    const rules = astRules(raw.rule) ?? astRules(raw.rules)
    const constraints = astConstraints(raw.constraints)
    if (rules !== undefined) return new Pattern.AstDetector({ patterns: [], rules, constraints })
    const patterns = typeof raw.pattern === "string" ? [raw.pattern] : strings(raw.pattern)
    if (patterns === undefined || patterns.length === 0) return undefined
    const inside = string(raw.inside)
    return new Pattern.AstDetector({ patterns, ...(inside === undefined ? {} : { inside }) })
  }

  const expression = string(raw.pattern)
  if (expression === undefined) return undefined
  try {
    new RegExp(expression)
  } catch {
    return undefined
  }
  return new Pattern.RegexDetector({
    pattern: expression,
    matchInComments: raw.matchInComments === true || raw.matchInComments === "true"
  })
}

const toPattern = (filePath: string, content: string): Pattern.Value | undefined => {
  const raw = parseFrontmatter(content)
  const name = string(raw.name)
  const selectedDetector = detector(raw)
  const toolRegex = string(raw.tool) ?? ".*"
  if (name === undefined || selectedDetector === undefined) return undefined
  try {
    new RegExp(toolRegex)
  } catch {
    return undefined
  }
  const rawLevel = string(raw.level) ?? "info"
  return new Pattern.Value({
    name,
    description: string(raw.description) ?? "",
    event: string(raw.event)?.toLowerCase() === "after" ? "after" : "before",
    toolRegex,
    level: (LEVELS.has(rawLevel) ? rawLevel : "info") as PatternLevel,
    glob: string(raw.glob),
    ignoreGlob: strings(raw.ignoreGlob),
    detector: selectedDetector,
    guidance: extractBody(content),
    suggestedSkills: strings(raw.suggestSkills),
    sourcePath: filePath
  })
}

const isSkipped = (name: string): boolean =>
  SKIPPED_FILES.some((prefix) =>
    name.startsWith(prefix) || name.toLowerCase() === `${prefix.toLowerCase()}.md`
  )

/** Recursively load valid Markdown pattern definitions in deterministic path order. */
export const loadPatterns = async (
  patternsDirectory: string
): Promise<ReadonlyArray<Pattern.Value>> => {
  const walk = async (directory: string): Promise<ReadonlyArray<Pattern.Value>> => {
    let entries: ReadonlyArray<string>
    try {
      entries = await readdir(directory)
    } catch {
      return []
    }
    const nested = await Promise.all(entries.map(async (entry) => {
      const target = path.join(directory, entry)
      try {
        const info = await stat(target)
        if (info.isDirectory()) return walk(target)
        if (!info.isFile() || !entry.endsWith(".md") || isSkipped(entry)) return []
        const pattern = toPattern(target, await readFile(target, "utf8"))
        return pattern === undefined ? [] : [pattern]
      } catch {
        return []
      }
    }))
    return nested.flat()
  }
  return (await walk(patternsDirectory)).toSorted((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath)
  )
}
