import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "context-tag-extends",
  shouldMatch: [
    // `*Tag extends Context.Tag` family (original scope)
    "class MyServiceTag extends Context.Tag",
    "class FooTag extends Context.Tag<FooTag>() { }",
    "export class ParallelClientTag extends Context.Tag",
    "Context.GenericTag<ParallelService>",
    "Context.GenericTag<MyClientService>",
    'Context.Tag("Legacy")',
    "class Legacy extends Effect.Service<Legacy>()('Legacy') {}",
    // `ServiceMap.*` family (merged from use-context-service)
    'class MyService extends ServiceMap.Service<MyService>()("@app/MyService", {})',
    'export class Foo extends ServiceMap.Service<Foo>()("Foo") {}',
    "ServiceMap.Reference",
    "ServiceMap.make({})",
    "ServiceMap.get(ctx, MyService)",
    "ServiceMap.add(ctx, MyService, impl)",
    "ServiceMap.mergeAll(a, b, c)"
  ],
  shouldNotMatch: [
    "Context.Service<ParallelClient>",
    "const MyClient = Context.Service<MyClient>()",
    "interface MyService { }",
    "class MyClass extends BaseClass { }",
    "Tag = 'value'",
    // Distinct `ServiceMap` accessors that aren't the banned set
    "ServiceMap.empty",
    // Strings / comments mentioning the banned names
    'const hint = "migrate ServiceMap.Service to Context.Service"',
    "/* ServiceMap.Service was deprecated */ const x = 1"
  ]
})
