import type { Plugin } from "@opencode-ai/plugin"

import { buildPatternFeedback } from "./guidance.ts"
import { matchesPattern } from "./pattern-matcher.ts"
import { Pattern } from "./pattern.ts"
import { actualProjection, type FileSnapshot, snapshotFile } from "./write-projection.ts"

interface PendingWrite {
  readonly files: ReadonlyArray<FileSnapshot>
  readonly fullFile: boolean
}

const property = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined

const stringProperty = (value: unknown, key: string): string | undefined => {
  const current = property(value, key)
  return typeof current === "string" ? current : undefined
}

const patchPaths = (patchText: string): ReadonlyArray<string> => {
  const paths: Array<string> = []
  for (const line of patchText.split("\n")) {
    const match = /^\*\*\* (?:Add|Update) File: (.+)$/.exec(line)
    if (match?.[1] !== undefined) paths.push(match[1])
    const move = /^\*\*\* Move to: (.+)$/.exec(line)
    if (move?.[1] !== undefined) paths.push(move[1])
  }
  return [...new Set(paths)]
}

const inputPaths = (tool: string, input: unknown): ReadonlyArray<string> => {
  if (tool === "write" || tool === "edit") {
    const filePath = stringProperty(input, "filePath") ?? stringProperty(input, "path")
    return filePath === undefined ? [] : [filePath]
  }
  if (tool === "apply_patch" || tool === "patch") {
    const patchText = stringProperty(input, "patchText")
    return patchText === undefined ? [] : patchPaths(patchText)
  }
  return []
}

/** Register prospective snapshots and post-write Effect pattern feedback hooks. */
export const registerPatternEnforcement = async (
  context: Plugin.Context,
  patterns: ReadonlyArray<Pattern.Value>
): Promise<void> => {
  const pending = new Map<string, PendingWrite>()

  await context.tool.hook("execute.before", async (event) => {
    try {
      const paths = inputPaths(event.tool, event.input)
      if (paths.length === 0) return
      const session = await context.session.get({ sessionID: event.sessionID })
      pending.set(event.id, {
        files: await Promise.all(
          paths.map((filePath) => snapshotFile(session.location.directory, filePath))
        ),
        fullFile: event.tool === "write"
      })
    } catch {
      pending.delete(event.id)
    }
  })

  await context.tool.hook("execute.after", async (event) => {
    const write = pending.get(event.id)
    pending.delete(event.id)
    if (event.status !== "completed" || write === undefined) return

    try {
      const feedback = (await Promise.all(write.files.map(async (file) => {
        const projection = await actualProjection(file)
        if (projection === undefined || projection.changedSpans?.length === 0) return undefined
        const input = write.fullFile
          ? { ...projection, changedSpans: [{ start: 0, end: projection.content.length }] }
          : projection
        const matched = patterns.filter((pattern) =>
          matchesPattern("edit", input, "after", pattern)
        )
        return matched.length === 0 ? undefined : buildPatternFeedback(matched, file.filePath)
      }))).filter((message): message is string => message !== undefined)
      if (feedback.length === 0) return
      const message = feedback.join("\n\n---\n\n")
      const content = event.result.content
      event.result = {
        ...event.result,
        content: Array.isArray(content)
          ? [...content, { type: "text", text: message }]
          : typeof content === "string"
          ? `${content}\n\n${message}`
          : message
      }
    } catch {
      // Pattern feedback must never turn an advisory check into a failed write.
    }
  })
}
