---
name: tsc-suggest-scripts
description: Suggest project typecheck scripts instead of raw tsc commands
event: before
tool: bash
pattern: (?<!(mise\s+(run\s+)?|npm\s+run\s+|bun\s+run\s+|turbo\s+|\$\s+))tsc(\s+--?(build|noEmit|watch|project|p)\b|\s*$)
action: context
level: info
---

# Use Project Typecheck Scripts

You ran `tsc` directly. This project may have established scripts for type checking that ensure consistent flags and configurations.

**Check for project scripts:**

1. `package.json` - Look for `scripts` like `typecheck`, `tsc`, or `type-check`
2. `.mise.toml` - Look for tasks like `typecheck` or `tc`
3. `Makefile`, `justfile`, or other task runner configs

**Why use project scripts?**

- Ensures consistent compiler flags across the team
- May include additional preprocessing or postprocessing
- Often provides enhanced error reporting or filtering
- Respects project-specific tsconfig paths and settings
