import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "prefer-redacted-config",
  tag: "ef-29-redacted-secrets",
  shouldMatch: [
    "Config.string('API_KEY')",
    'Config.string("GITHUB_TOKEN")',
    "Config.nonEmptyString('CLIENT_SECRET')",
    "Config.string('DATABASE_URL').pipe(Config.withDefault('postgres://localhost'))",
    "Config.string('connection_string')",
    "Config.string('PRIVATE-KEY')",
    "Config.schema(Schema.Struct({ apiKey: Schema.String }))",
    "Config.schema(Schema.Struct({ password: Schema.NonEmptyString }))",
    "Config.schema(Schema.Struct({ token: Schema.String.pipe(Schema.minLength(1)) }))",
    "Config.schema(Schema.Struct({ credentials: Schema.Struct({ clientSecret: Schema.String }) }))",
    'Config.schema(Schema.Class<AppConfig>("AppConfig")({ databaseUrl: Schema.String }))'
  ],
  shouldNotMatch: [
    "Config.redacted('API_KEY')",
    "Config.string('HOST')",
    "Config.nonEmptyString('USERNAME')",
    "Config.url('CALLBACK_URL')",
    "Config.string(configKey)",
    "Config.nonEmptyString(name)",
    "Config.schema(Schema.Struct({ host: Schema.String }))",
    "Config.schema(Schema.Struct({ apiKey: Schema.Redacted(Schema.String) }))",
    "Config.schema(Schema.Struct({ password: Schema.Redacted(Schema.NonEmptyString) }))",
    "Config.schema(Schema.Struct({ callbackUrl: Schema.String }))",
    "const schema = Schema.Struct({ apiKey: Schema.String })",
    "const hint = 'Config.string(\"API_KEY\") should be redacted'",
    '// Config.string("API_KEY")',
    "/* Config.schema(Schema.Struct({ apiKey: Schema.String })) */ const x = 1"
  ]
})
