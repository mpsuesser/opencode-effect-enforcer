import { Skill } from "@opencode/plugin"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { extractBody, parseFrontmatter } from "./frontmatter.ts"

/** Load bundled directory skills as OpenCode V2 skill definitions. */
export const loadSkills = async (skillsDirectory: string): Promise<ReadonlyArray<Skill.Info>> => {
  const entries = await readdir(skillsDirectory, { withFileTypes: true })
  const skills = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const skillPath = path.resolve(skillsDirectory, entry.name, "SKILL.md")
      const markdown = await readFile(skillPath, "utf8")
      const frontmatter = parseFrontmatter(markdown)
      const displayName = typeof frontmatter.name === "string" ? frontmatter.name : entry.name
      const description = typeof frontmatter.description === "string"
        ? frontmatter.description
        : undefined
      return Skill.Info.make({
        id: Skill.ID.make(entry.name),
        name: Skill.Name.make(displayName),
        description,
        path: Skill.Info.fields.path.make(skillPath),
        content: extractBody(markdown)
      })
    })
  )
  return skills.toSorted((left, right) => left.id.localeCompare(right.id))
}
