const REQUEST_KEY = "opencode-effect-enforcer"

interface AgentPolicyTarget {
  readonly request: {
    readonly body: Record<string, unknown>
  }
  readonly permissions: Array<{
    readonly action: string
    readonly resource: string
    readonly effect: "allow" | "ask" | "deny"
  }>
}

/** Consume an agent's Effect Enforcer setting and apply its skill opt-out. */
export const consumeAgentOptOut = (agent: AgentPolicyTarget): boolean => {
  const disabled = agent.request.body[REQUEST_KEY] === false
  delete agent.request.body[REQUEST_KEY]
  if (!disabled) return false

  agent.permissions.push({ action: "skill", resource: "effect-*", effect: "deny" })
  return true
}
