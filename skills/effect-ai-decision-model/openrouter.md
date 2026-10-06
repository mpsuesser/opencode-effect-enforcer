# OpenRouter decision adapter

Baseline: `@effect/ai-openrouter@4.0.0`, aligned with `effect`. This adapter calls
OpenRouter's **alpha Decisions API**, not chat completions.

`OpenRouterDecisionModel.make({ model, config? })` returns
`Effect<DecisionModel, never, OpenRouterClient>`; `layer` takes the same options
and provides `DecisionModel`. `model(modelId, config?)` returns
`Model.Model<'openrouter', DecisionModel, OpenRouterClient>`, including provider
and model-name metadata. All accept a string model ID; use a currently available
decision-capable ID from OpenRouter rather than the direct TypeSafe alias.

<!-- typecheck -->
```ts
import * as OpenRouterClient from '@effect/ai-openrouter/OpenRouterClient';
import * as OpenRouterDecisionModel from '@effect/ai-openrouter/OpenRouterDecisionModel';
import * as BunHttpClient from '@effect/platform-bun/BunHttpClient';
import * as AiError from 'effect/ai/AiError';
import * as DecisionModel from 'effect/ai/DecisionModel';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

const DecisionsLive = Layer.unwrap(
  Config.String('OPENROUTER_DECISION_MODEL').pipe(
    Effect.map((model) => OpenRouterDecisionModel.layer({ model }))
  )
).pipe(
  Layer.provide(OpenRouterClient.layerConfig({
    apiKey: Config.Redacted('OPENROUTER_API_KEY')
  })),
  Layer.provide(BunHttpClient.layer)
);

declare const decision: Effect.Effect<unknown, AiError.AiError, DecisionModel.DecisionModel>;

const configured = decision.pipe(
  Effect.provideService(OpenRouterDecisionModel.Config, { user: 'tenant-42' }),
  Effect.provide(DecisionsLive)
);
```

- `Config` is the service exported by **OpenRouterDecisionModel**, distinct from
  Effect's configuration module and `OpenRouterConfig`. Its shape is
  `Pick<typeof OpenRouterSchema.DecisionsRequest.Encoded, 'provider' | 'session_id' | 'user' | 'trace'>`.
  Runtime fields shallowly override constructor `config`; nested provider options
  are replaced, not deep-merged. It cannot override `model`, state, or questions.
- `OpenRouterClient.layerConfig` loads only supplied config fields; unlike
  `TypeSafeClient.layerConfig()`, it does not default an API-key environment name.
  Client options also include `apiUrl`, `siteReferrer`, `siteTitle`, and
  `transformClient`; scoped `OpenRouterConfig.withClientTransform` applies to
  decision requests.
- Default endpoint: `https://openrouter.ai/api/alpha/decisions`. Custom `apiUrl`
  removes a trailing `/v1` (optional trailing slash) before appending
  `/alpha/decisions`, preserving proxy prefixes.
- Encoded state must be a string, object, or array; scalar null/number/boolean
  fails locally with `AiError` reason `InvalidUserInputError`.
- Choice/Score **must include full distributions** for the high-level adapter;
  missing distributions fail with `InvalidOutputError` even if a wire response
  otherwise decodes. Score index keys map to criteria strings. The adapter uses
  two-decimal probability normalization and common core answer validation.
- For response ID, cost, provider metadata, or HTTP response details, yield
  `OpenRouterClient.OpenRouterClient` and call `createDecisions(request)`. It
  returns `[decodedBody, HttpClientResponse]` with `AiError` failures. Its schemas
  are `OpenRouterSchema.DecisionsRequest`, `DecisionsQuestion`, and
  `DecisionsResponse`. High-level `decide` projects only answers and token usage.

Pinned source: `packages/ai/openrouter/src/{OpenRouterDecisionModel,OpenRouterClient,OpenRouterConfig,OpenRouterSchema}.ts`
at `effect@4.0.0`; corresponding `test/OpenRouterDecisionModel.test.ts` and
`typetest/OpenRouterDecisionModel.tst.ts` cover adapter behavior and configuration.
