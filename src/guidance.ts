import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { Pattern } from "./pattern.ts"

const LEVEL_ORDER: Record<Pattern.Value["level"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  warning: 3,
  info: 4
}

/** Load bundled guidance documents in deterministic filename order. */
export const loadGuidance = async (guidanceDirectory: string): Promise<string> => {
  const entries = (await readdir(guidanceDirectory)).filter((entry) => entry.endsWith(".md"))
    .toSorted()
  const documents = (await Promise.all(
    entries.map((entry) => readFile(path.join(guidanceDirectory, entry), "utf8"))
  ))
    .map((content) => content.trim())
    .filter((content) => content.length > 0)
  return documents.join("\n\n---\n\n")
}

const guidanceWithSkillHints = (pattern: Pattern.Value): string => {
  const hints =
    pattern.suggestedSkills?.map((skill) =>
      `If you have not loaded the \`${skill}\` skill, load it before continuing.`
    ) ?? []
  return hints.length === 0 ? pattern.guidance : `${pattern.guidance}\n\n${hints.join("\n")}`
}

/** Compose one severity-ordered, model-visible review request for a completed write. */
export const buildPatternFeedback = (
  patterns: ReadonlyArray<Pattern.Value>,
  filePath: string
): string => {
  const selected = [...patterns].toSorted((left, right) =>
    LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level]
  )
  return [
    "opencode-effect-enforcer review request:",
    `File: \`${filePath}\``,
    "",
    "I noticed potential Effect-pattern issues in the write you just completed.",
    "Inspect this change now. If a warning is valid, revise the code before continuing.",
    "If it is a false positive or intentional exception, briefly say so and continue.",
    "",
    "Matched patterns:",
    ...selected.map((pattern) => `- ${pattern.name} [${pattern.level}]: ${pattern.description}`),
    "",
    "Relevant guidance:",
    ...selected.map((pattern) => `## ${pattern.name}\n${guidanceWithSkillHints(pattern)}`)
  ].join("\n")
}

/** Add OpenCode-specific operating instructions to the copied Effect guidance. */
export const withPluginPolicy = (guidance: string): string =>
  [
    guidance,
    "OpenCode Effect Enforcer policy:",
    "- The bundled effect-* skills are available through OpenCode's skill tool. Load at least four relevant skills before planning or writing Effect code.",
    "- Treat post-write pattern feedback as an immediate review request. Fix valid findings before continuing.",
    "- Pattern findings are advisory: explain intentional exceptions or false positives instead of changing correct code."
  ].join("\n\n---\n\n")
