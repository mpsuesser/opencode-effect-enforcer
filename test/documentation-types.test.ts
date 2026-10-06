import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import ts from "typescript"
import { expect, it } from "vitest"

// Compiler/filesystem boundary: marked blocks are independent virtual TS modules.
// Their paths remain beside the Markdown so normal package resolution applies.
// Decision-provider examples use release-pinned dev adapters and Bun transport.
// Pin node-shared too: Bun's ^4.0.0 dependency can select a newer Effect peer range.
const root = resolve(import.meta.dirname, "..")
const markedBlock = /<!-- typecheck -->\s*```(?:ts|typescript)\r?\n([\s\S]*?)\r?\n```/g
const typescriptBlock = /```(ts|typescript|tsx)\r?\n([\s\S]*?)\r?\n```/g

it("checks all Effect imports and marked examples against the installed release", async () => {
  const documents = await Promise.all(
    ["skills", "guidance", "patterns"].map(async (directory) => {
      const base = resolve(root, directory)
      const entries = await readdir(base, { recursive: true })
      return entries.filter((entry) => entry.endsWith(".md")).map((entry) => resolve(base, entry))
    })
  )
  const modules = new Map<string, ts.SourceFile>()
  const markedModules = new Set<string>()
  const importModules = new Set<string>()
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
        markedModules.add(filename)
      }
      // Fragments need not be runnable to check their real package entrypoints
      // and named exports. Isolate each import to avoid alias collisions between
      // illustrative snippets; companion packages are reviewed against tagged source.
      for (const match of markdown.matchAll(typescriptBlock)) {
        const code = match[2]
        if (code === undefined) continue
        const fragment = ts.createSourceFile(
          path,
          code,
          ts.ScriptTarget.ESNext,
          true,
          match[1] === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        )
        for (const statement of fragment.statements) {
          if (
            !ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
          ) {
            continue
          }
          const specifier = statement.moduleSpecifier.text
          if (specifier !== "effect" && !specifier.startsWith("effect/")) continue
          const line = markdown.slice(0, match.index).split("\n").length
          const filename = `${path}.import-${line}-${statement.pos}.ts`
          modules.set(
            filename,
            ts.createSourceFile(filename, statement.getText(fragment), ts.ScriptTarget.ESNext, true)
          )
          importModules.add(filename)
        }
      }
    })
  )

  expect(markedModules.size).toBeGreaterThanOrEqual(5)
  expect(importModules.size).toBeGreaterThan(100)
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
