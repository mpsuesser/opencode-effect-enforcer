import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-sync-fs",
  tag: "no-sync-fs",
  shouldMatch: [
    'const content = readFileSync("file.txt", "utf-8")',
    "fs.readFileSync(path)",
    'writeFileSync("file.txt", data)',
    "fs.writeFileSync(filepath, content)",
    'mkdirSync("dir")',
    "fs.mkdirSync(dirpath, { recursive: true })",
    'readdirSync(".")',
    "fs.readdirSync(directory)",
    "statSync(path)",
    "fs.statSync(filepath)",
    "existsSync(path)",
    "fs.existsSync(filepath)",
    "copyFileSync(src, dest)",
    "unlinkSync(path)",
    "rmdirSync(dir)",
    "renameSync(old, newName)",
    "appendFileSync(file, data)"
  ],
  shouldNotMatch: [
    "FileSystem.readFileString(path)",
    "fs.readFileString(filepath)",
    "FileSystem.writeFileString(path, content)",
    "FileSystem.makeDirectory(dirpath)",
    "FileSystem.readDirectory(directory)",
    "FileSystem.exists(filepath)",
    "FileSystem.remove(filepath)",
    "// readFileSync is mentioned in comment",
    "const readFileSync = customImplementation",
    // String / template / comment content mentioning sync methods
    "const hint = 'avoid readFileSync()'",
    'const doc = "use FileSystem.readFileString instead of fs.readFileSync"',
    "const tmpl = `prefer async writeFileString over writeFileSync`",
    "/* readFileSync is blocking */ const x = 1",
    // Import statements mentioning the method
    "import { readFileSync } from 'node:fs'"
  ]
})
