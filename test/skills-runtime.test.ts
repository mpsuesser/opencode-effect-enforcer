import { describe, expect, it } from "vitest"

import { loadSkills } from "../src/skills.ts"

describe("loadSkills", () => {
  it("constructs every bundled OpenCode skill", async () => {
    const skills = await loadSkills("skills")

    expect(skills).toHaveLength(54)
    expect(skills[0]?.id).toBe("effect-ai-chat")
    expect(skills.at(-1)?.id).toBe("effect-workflow")
  })
})
