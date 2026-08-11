import type { NapiConfig, Rule as AstGrepRuleDefinition } from "@ast-grep/napi"

/** Pattern severity controls feedback ordering. */
export type PatternLevel = "critical" | "high" | "medium" | "warning" | "info"

/** A half-open source span. */
export interface Span {
  readonly start: number
  readonly end: number
}

/** Normalized content passed to pattern detectors. */
export interface MatcherInput {
  readonly filePath?: string
  readonly content: string
  readonly changedSpans?: ReadonlyArray<Span>
}

/** Pattern definitions loaded from the bundled Markdown catalog. */
export namespace Pattern {
  /** A source location matched by a detector. */
  export class MatchLocation implements Span {
    readonly start: number
    readonly end: number
    readonly line: number
    readonly column: number
    readonly snippet: string

    constructor(fields: MatchLocation) {
      this.start = fields.start
      this.end = fields.end
      this.line = fields.line
      this.column = fields.column
      this.snippet = fields.snippet
    }
  }

  /** A regular-expression detector. */
  export class RegexDetector {
    readonly pattern: string
    readonly matchInComments: boolean

    constructor(fields: RegexDetector) {
      this.pattern = fields.pattern
      this.matchInComments = fields.matchInComments
    }
  }

  /** An ast-grep detector supporting legacy patterns and complete rules. */
  export class AstDetector {
    readonly patterns: ReadonlyArray<string>
    readonly rules: ReadonlyArray<AstGrepRuleDefinition> | undefined
    readonly constraints: NapiConfig["constraints"] | undefined
    readonly inside: string | undefined

    constructor(fields: {
      readonly patterns: ReadonlyArray<string>
      readonly rules?: ReadonlyArray<AstGrepRuleDefinition>
      readonly constraints?: NapiConfig["constraints"]
      readonly inside?: string
    }) {
      this.patterns = fields.patterns
      this.rules = fields.rules
      this.constraints = fields.constraints
      this.inside = fields.inside
    }
  }

  /** A complete enforcement pattern and its model-facing remediation guidance. */
  export class Value {
    readonly name: string
    readonly description: string
    readonly event: "before" | "after"
    readonly toolRegex: string
    readonly level: PatternLevel
    readonly glob: string | undefined
    readonly ignoreGlob: ReadonlyArray<string> | undefined
    readonly detector: RegexDetector | AstDetector
    readonly guidance: string
    readonly suggestedSkills: ReadonlyArray<string> | undefined
    readonly sourcePath: string

    constructor(fields: Value) {
      this.name = fields.name
      this.description = fields.description
      this.event = fields.event
      this.toolRegex = fields.toolRegex
      this.level = fields.level
      this.glob = fields.glob
      this.ignoreGlob = fields.ignoreGlob
      this.detector = fields.detector
      this.guidance = fields.guidance
      this.suggestedSkills = fields.suggestedSkills
      this.sourcePath = fields.sourcePath
    }
  }
}
