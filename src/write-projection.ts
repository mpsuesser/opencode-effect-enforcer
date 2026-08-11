import { diffLines } from "diff"
import { readFile } from "node:fs/promises"
import path from "node:path"

import type { MatcherInput, Span } from "./pattern.ts"

/** A file captured immediately before a mutating tool executes. */
export interface FileSnapshot {
  readonly absolutePath: string
  readonly filePath: string
  readonly content?: string
}

/** Resolve a tool-provided path against the active OpenCode session directory. */
export const resolveToolPath = (directory: string, filePath: string): string =>
  path.isAbsolute(filePath) ? filePath : path.resolve(directory, filePath)

/** Normalize a path for portable pattern-glob matching. */
export const relativeToolPath = (directory: string, filePath: string): string =>
  path.relative(directory, resolveToolPath(directory, filePath)).replaceAll(path.sep, "/")

/** Read a pre-write snapshot without failing the intercepted tool operation. */
export const snapshotFile = async (directory: string, filePath: string): Promise<FileSnapshot> => {
  const absolutePath = resolveToolPath(directory, filePath)
  try {
    return {
      absolutePath,
      filePath: relativeToolPath(directory, filePath),
      content: await readFile(absolutePath, "utf8")
    }
  } catch {
    return { absolutePath, filePath: relativeToolPath(directory, filePath) }
  }
}

/** Compute half-open spans occupied by text added to the final output. */
export const changedSpans = (before: string | undefined, after: string): ReadonlyArray<Span> => {
  if (before === undefined) return after.length === 0 ? [] : [{ start: 0, end: after.length }]
  let cursor = 0
  const spans: Array<Span> = []
  for (const change of diffLines(before, after)) {
    if (change.added === true) {
      spans.push({ start: cursor, end: cursor + change.value.length })
      cursor += change.value.length
      continue
    }
    if (change.removed !== true) cursor += change.value.length
  }
  return spans
}

/** Read final file contents and project only text added by the completed write. */
export const actualProjection = async (
  snapshot: FileSnapshot
): Promise<MatcherInput | undefined> => {
  try {
    const content = await readFile(snapshot.absolutePath, "utf8")
    return {
      filePath: snapshot.filePath,
      content,
      changedSpans: changedSpans(snapshot.content, content)
    }
  } catch {
    return undefined
  }
}
