import { Plugin } from "@opencode-ai/plugin"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { registerPatternEnforcement } from "./enforcer.ts"
import { loadGuidance, withPluginPolicy } from "./guidance.ts"
import { loadPatterns } from "./pattern-catalog.ts"
import { loadSkills } from "./skills.ts"

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export default Plugin.define({
  id: "opencode.effect-enforcer",
  setup: async (context) => {
    const [guidance, patterns, skills] = await Promise.all([
      loadGuidance(path.join(packageDirectory, "guidance")),
      loadPatterns(path.join(packageDirectory, "patterns")),
      loadSkills(path.join(packageDirectory, "skills"))
    ])

    await context.skill.transform((draft) => {
      for (const skill of skills) draft.add(skill)
    })
    await context.session.hook("context", (event) => {
      event.system.push({ type: "text", text: withPluginPolicy(guidance) })
    })
    await registerPatternEnforcement(context, patterns)
  }
})
