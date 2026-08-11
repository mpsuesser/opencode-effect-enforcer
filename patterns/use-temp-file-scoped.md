---
action: context
tool: (edit|write)
event: after
name: use-temp-file-scoped
description: Use makeTempFileScoped/makeTempDirectoryScoped instead of os.tmpdir() or non-scoped variants
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - kind: import_statement
              - regex: '["''](?:node:)?os["'']'
        - pattern: require($SPEC)
        - pattern: import($SPEC)
        - pattern: os.tmpdir()
        - pattern: $FS.makeTempFile($$$)
        - pattern: $FS.makeTempDirectory($$$)
constraints:
    SPEC:
        regex: '^["''](?:node:)?os["'']$'
level: warning
suggestSkills:
    - effect-filesystem
---

# Use Scoped Temp Files for Automatic Cleanup

```haskell
-- Transformation
os.tmpdir        :: IO FilePath              -- Node-coupled, manual cleanup
makeTempFile     :: Effect FilePath FS       -- manual cleanup required
makeTempFileScoped :: Effect FilePath (FS | Scope)  -- auto cleanup

-- Scoped resources
withTempFile :: (FilePath → Effect a) → Effect a
withTempFile use = scoped $ do
  path ← makeTempFileScoped { prefix: "myapp-" }
  use path
  -- auto cleanup on scope exit, even on error
```

```haskell
-- Pattern
bad :: Effect () FS
bad = do
  tmpFile ← makeTempFile
  writeFileString tmpFile "data"
  remove tmpFile                    -- might not run on error!

good :: Effect () (FS | Scope)
good = scoped $ do
  tmpFile ← makeTempFileScoped { prefix: "myapp-" }
  writeFileString tmpFile "data"
  -- auto removed when scope ends

-- Directories too
withTempDir :: Effect () (FS | Scope)
withTempDir = scoped $ do
  dir ← makeTempDirectoryScoped { prefix: "myapp-" }
  path ← join dir "file.txt"
  writeFileString path "data"
  -- entire dir removed when scope ends
```

`makeTempFileScoped` provides automatic cleanup via Effect's scope. Never use `os.tmpdir()` (Node-coupled) or unscoped variants (leak resources).
