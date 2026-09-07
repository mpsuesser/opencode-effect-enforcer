import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import ts from "typescript"
import { expect, it } from "vitest"

// Compiler/filesystem boundary: marked blocks are independent virtual TS modules.
// Their paths remain beside the Markdown so normal package resolution applies.
const root = resolve(import.meta.dirname, "..")
const markedBlock = /<!-- typecheck -->\s*```(?:ts|typescript)\r?\n([\s\S]*?)\r?\n```/g

it("typechecks marked documentation examples against the installed Effect release", async () => {
  const documents = await Promise.all(
    ["skills", "guidance", "patterns"].map(async (directory) => {
      const base = resolve(root, directory)
      const entries = await readdir(base, { recursive: true })
      return entries.filter((entry) => entry.endsWith(".md")).map((entry) => resolve(base, entry))
    })
  )
  const modules = new Map<string, ts.SourceFile>()
  await Promise.all(
    documents.flat().map(async (path) => {
      const markdown = await readFile(path, "utf8")
      const blocks = [...markdown.matchAll(markedBlock)]
      expect(blocks, `Every typecheck marker must precede a complete TS fence: ${path}`)
        .toHaveLength(markdown.split("<!-- typecheck -->").length - 1)
      for (const match of blocks) {
        const code = match[1]
        if (code === undefined) continue
        const line = markdown.slice(0, match.index).split("\n").length
        const filename = `${path}.line-${line}.ts`
        modules.set(filename, ts.createSourceFile(filename, code, ts.ScriptTarget.ESNext, true))
      }
    })
  )

  expect(modules.size).toBeGreaterThanOrEqual(5)
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    moduleDetection: ts.ModuleDetectionKind.Force,
    types: []
  }
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (filename, languageVersion, onError, shouldCreateNewSourceFile) =>
    modules.get(filename)
      ?? getSourceFile(filename, languageVersion, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram([...modules.keys()], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  expect(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n"
  })).toBe("")
}, 30_000)
