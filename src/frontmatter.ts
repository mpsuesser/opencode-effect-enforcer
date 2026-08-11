import YAML from "yaml"

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/
const SAFE_VALUE_RE = /^[\w\s.\-/]+$/

const isAlreadyQuoted = (value: string): boolean =>
  (value.startsWith("'") && value.endsWith("'"))
  || (value.startsWith('"') && value.endsWith('"'))

const quoteYamlValue = (line: string): string => {
  const match = line.match(/^(\s*)(\w[\w-]*):\s+(.+)$/)
  if (match === null) return line
  const [, indent, key, value] = match
  if (indent === undefined || key === undefined || value === undefined) return line
  if (isAlreadyQuoted(value) || SAFE_VALUE_RE.test(value)) return line
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
  return `${indent}${key}: "${escaped}"`
}

/** Parse YAML frontmatter, including unquoted detector expressions used by the pattern catalog. */
export const parseFrontmatter = (content: string): Record<string, unknown> => {
  const match = content.match(FRONTMATTER_RE)
  if (match?.[1] === undefined) return {}
  try {
    const parsed: unknown = YAML.parse(match[1].split("\n").map(quoteYamlValue).join("\n"))
    return typeof parsed === "object" && parsed !== null ? { ...parsed } : {}
  } catch {
    return {}
  }
}

/** Remove YAML frontmatter and return the trimmed Markdown body. */
export const extractBody = (content: string): string =>
  content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim()
