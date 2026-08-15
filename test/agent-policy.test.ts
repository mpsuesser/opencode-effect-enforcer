import { describe, expect, it } from "vitest"

import { consumeAgentOptOut } from "../src/agent-policy.ts"

const agent = (setting: unknown) => ({
  request: { body: { "opencode-effect-enforcer": setting, existing: true } },
  permissions: [{ action: "read", resource: "*", effect: "allow" as const }]
})

describe("agent policy", () => {
  it("consumes a false setting and denies bundled skills", () => {
    const target = agent(false)

    expect(consumeAgentOptOut(target)).toBe(true)
    expect(target.request.body).toEqual({ existing: true })
    expect(target.permissions).toEqual([
      { action: "read", resource: "*", effect: "allow" },
      { action: "skill", resource: "effect-*", effect: "deny" }
    ])
  })

  it("does not disable enforcement for other values", () => {
    const target = agent(true)

    expect(consumeAgentOptOut(target)).toBe(false)
    expect(target.request.body).toEqual({ existing: true })
    expect(target.permissions).toEqual([
      { action: "read", resource: "*", effect: "allow" }
    ])
  })
})
