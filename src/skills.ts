import { Skill } from "@opencode-ai/plugin"
import { Schema } from "effect"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { extractBody, parseFrontmatter } from "./frontmatter.ts"

/** Load bundled directory skills as OpenCode V2 skill definitions. */
export const loadSkills = async (skillsDirectory: string): Promise<ReadonlyArray<Skill.Info>> => {
  const entries = await readdir(skillsDirectory, { withFileTypes: true })
  const skills = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const location = path.join(skillsDirectory, entry.name, "SKILL.md")
      const markdown = await readFile(location, "utf8")
      const frontmatter = parseFrontmatter(markdown)
      const displayName = typeof frontmatter.name === "string" ? frontmatter.name : entry.name
      const description = typeof frontmatter.description === "string"
        ? frontmatter.description
        : undefined
      return Schema.decodeUnknownSync(Skill.Info)({
        id: entry.name,
        name: displayName,
        description,
        location,
        content: extractBody(markdown)
      })
    })
  )
  return skills.toSorted((left, right) => left.id.localeCompare(right.id))
}
