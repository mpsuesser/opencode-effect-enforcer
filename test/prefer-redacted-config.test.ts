import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "prefer-redacted-config",
  tag: "ef-29-redacted-secrets",
  shouldMatch: [
    "Config.String('API_KEY')",
    'Config.String("GITHUB_TOKEN")',
    "Config.NonEmptyString('CLIENT_SECRET')",
    "Config.String('DATABASE_URL').pipe(Config.withDefault('postgres://localhost'))",
    "Config.String('connection_string')",
    "Config.String('PRIVATE-KEY')",
    "Config.schema(Schema.Struct({ apiKey: Schema.String }))",
    "Config.schema(Schema.Struct({ password: Schema.NonEmptyString }))",
    "Config.schema(Schema.Struct({ token: Schema.String.pipe(Schema.minLength(1)) }))",
    "Config.schema(Schema.Struct({ credentials: Schema.Struct({ clientSecret: Schema.String }) }))",
    'Config.schema(Schema.Class<AppConfig>("AppConfig")({ databaseUrl: Schema.String }))'
  ],
  shouldNotMatch: [
    "Config.Redacted('API_KEY')",
    "Config.String('HOST')",
    "Config.NonEmptyString('USERNAME')",
    "Config.URL('CALLBACK_URL')",
    "Config.String(configKey)",
    "Config.NonEmptyString(name)",
    "Config.schema(Schema.Struct({ host: Schema.String }))",
    "Config.schema(Schema.Struct({ apiKey: Schema.Redacted(Schema.String) }))",
    "Config.schema(Schema.Struct({ password: Schema.Redacted(Schema.NonEmptyString) }))",
    "Config.schema(Schema.Struct({ callbackUrl: Schema.String }))",
    "const schema = Schema.Struct({ apiKey: Schema.String })",
    "const hint = 'Config.String(\"API_KEY\") should be redacted'",
    '// Config.String("API_KEY")',
    "/* Config.schema(Schema.Struct({ apiKey: Schema.String })) */ const x = 1"
  ]
})
