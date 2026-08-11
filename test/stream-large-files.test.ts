import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "stream-large-files",
  tag: "consider-streaming",
  shouldMatch: [
    "await fs.readFileString('/data/large.txt')",
    "fs.readFile('/var/log/app.log')",
    "fs.readFileString(path.join(dir, fileName))",
    "fs.readFileString(files[index])",
    "fs.readFileString(entry.path)",
    "fs.readFileString(logPath)"
  ],
  shouldNotMatch: [
    "fs.stream(path)",
    "Stream.fromFile(path)",
    "fs.writeFile(path, content)",
    "fs.readDir(path)",
    "fs.readFile(path)",
    "fs.readFileString(filePath)",
    "fs.readFileString('config.toml')",
    "fs.readFileString('themes-by-mode.json')",
    // Sync variants are flagged by avoid-sync-fs, not this pattern
    "fs.readFileSync(path)",
    // Non-fs objects with similarly-named methods
    "buffer.readFile(path)",
    // String / template / comment content
    'const hint = "consider streaming fs.readFile"',
    "const doc = 'fs.readFileString loads entire file'",
    "// fs.readFile is OK for small files",
    "/* fs.readFile is fine for config */ const x = 1"
  ]
})
