---
name: effect-graph
description: Build and analyze immutable graphs with Effect's Graph module — directed/undirected construction, scoped mutation (mutate/addNode/addEdge), node/edge queries, lazy DFS/BFS/topo walkers, algorithms (isAcyclic, stronglyConnectedComponents, dijkstra/astar/bellmanFord/floydWarshall), and GraphViz/Mermaid export. Use when modeling dependency graphs, ordering tasks topologically, detecting cycles, computing reachability or shortest paths, or rendering relationship diagrams.
---

You are an Effect TypeScript expert specializing in the `Graph` module — building, querying, traversing, and running algorithms over immutable graphs.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — the module is self-contained in a single file.

Key files:

- `packages/effect/src/Graph.ts` — the entire module: types, constructors, mutation scope, queries, walkers, traversals, algorithms, GraphViz/Mermaid export
- `packages/effect/test/Graph.test.ts` — edge-case semantics: multi-edges, self-loops, undefined node/edge data, negative-weight behavior, walker re-iteration, topo `initials`

## Core Model

A `Graph<N, E, T extends Kind = 'directed'>` is an **immutable** graph storing user data `N` on nodes and `E` on edges, where `T` is `'directed' | 'undirected'`. Writes only happen on a `MutableGraph<N, E, T>` inside an explicit mutation scope; everything else (queries, traversals, algorithms) accepts either form.

```ts
import { Graph, Option } from 'effect';
// or as a subpath module:
import * as Graph from 'effect/Graph';
```

The pieces:

- `Graph.NodeIndex` / `Graph.EdgeIndex` — plain `number` identifiers. They are allocated sequentially from `0` and **never reused after removal**; they are stable IDs, not array offsets.
- `Graph.Edge<E>` — a `Data.Class` with `{ source: NodeIndex; target: NodeIndex; data: E }`.
- `Graph.DirectedGraph<N, E>` / `Graph.UndirectedGraph<N, E>` — aliases for `Graph<N, E, 'directed' | 'undirected'>`; `MutableDirectedGraph` / `MutableUndirectedGraph` are the mutable counterparts.
- `Graph.GraphError` — a `Data.TaggedError('GraphError')<{ message: string }>`. The Graph API is fully **synchronous**: nothing returns `Effect`. Invalid operations **throw** `GraphError`; lookups return `Option`.
- `Graph.Walker<T, N>` — the lazy iterator wrapper returned by all traversal and listing APIs.

Call conventions:

- **Read APIs are dual** (data-first or pipeable data-last): `Graph.neighbors(graph, 0)` or `graph.pipe(Graph.neighbors(0))`.
- **Write APIs are data-first only** and take the `MutableGraph` as the first argument: `Graph.addNode(mutable, data)`.
- Graphs implement `Equal`, `Hash`, `Pipeable`, `Inspectable`, and are iterable over `[NodeIndex, N]` node entries.

## 1. Creating Graphs

`Graph.directed` and `Graph.undirected` create empty graphs, optionally running an initial mutation callback:

```ts
import { Graph } from 'effect';

const dag = Graph.directed<string, number>((mutable) => {
	const a = Graph.addNode(mutable, 'A'); // NodeIndex 0
	const b = Graph.addNode(mutable, 'B'); // NodeIndex 1
	const c = Graph.addNode(mutable, 'C'); // NodeIndex 2
	Graph.addEdge(mutable, a, b, 1); // EdgeIndex 0
	Graph.addEdge(mutable, b, c, 2); // EdgeIndex 1
});

const social = Graph.undirected<{ name: string }, string>((mutable) => {
	const alice = Graph.addNode(mutable, { name: 'Alice' });
	const bob = Graph.addNode(mutable, { name: 'Bob' });
	Graph.addEdge(mutable, alice, bob, 'friends');
});

Graph.isGraph(dag); // true — type guard for unknown values
```

Notes:

- The type parameters are `<NodeData, EdgeData>`; the kind is fixed by the constructor.
- Edge data can be `void`/`undefined` — pass `undefined` explicitly: `Graph.addEdge(m, a, b, undefined)`.
- Self-loops (`addEdge(m, a, a, data)`) and parallel edges between the same pair are allowed.
- For directed graphs, `source -> target` direction matters everywhere (traversal, topo, neighbors). For undirected graphs, the stored `source`/`target` are arbitrary endpoints; all queries and algorithms treat the edge symmetrically.

## 2. Mutation: Scoped Writes

All writes go through a mutation scope. Prefer `Graph.mutate` (dual), which copies the graph, applies your function, and returns a new immutable graph:

```ts
const bigger = Graph.mutate(dag, (mutable) => {
	const d = Graph.addNode(mutable, 'D');
	Graph.addEdge(mutable, 2, d, 3);
});
// dag is unchanged; bigger is a new Graph
```

`beginMutation` / `endMutation` exist for manual control, but discard the `MutableGraph` after `endMutation` — the returned immutable graph shares adjacency state with it, so further writes to the old mutable value would corrupt the snapshot. `mutate` avoids this footgun entirely. Each scope costs an O(V+E) copy, so batch all changes into one `mutate` call instead of chaining many.

Write operations (all take the `MutableGraph` first; all return `void` except the two `add*`):

```ts
Graph.mutate(dag, (m) => {
	const idx = Graph.addNode(m, 'X'); // returns new NodeIndex
	const e = Graph.addEdge(m, 0, idx, 9); // returns new EdgeIndex; THROWS GraphError if either node is missing
	Graph.updateNode(m, idx, (data) => data.toLowerCase()); // silent no-op if index missing
	Graph.updateEdge(m, e, (w) => w * 2); // silent no-op if index missing
	Graph.removeEdge(m, e); // silent no-op if missing
	Graph.removeNode(m, idx); // removes the node AND all incident edges; no-op if missing
});
```

## 3. Node & Edge Queries

Read APIs work on both `Graph` and `MutableGraph`, and are dual:

```ts
Graph.nodeCount(dag); // 3
Graph.edgeCount(dag); // 2
Graph.hasNode(dag, 0); // true
Graph.getNode(dag, 0); // Option.some('A')
Graph.getEdge(dag, 0); // Option.some(Edge { source: 0, target: 1, data: 1 })
Graph.hasEdge(dag, 0, 1); // true — (graph, source, target); symmetric for undirected graphs

// Linear search by predicate (O(n) — keep your own Map<key, NodeIndex> for hot paths)
Graph.findNode(dag, (data) => data === 'B'); // Option.some(1)
Graph.findNodes(dag, (data) => data !== 'B'); // [0, 2]
Graph.findEdge(dag, (data, source, target) => data > 1); // Option.some(1)
Graph.findEdges(dag, (data) => data >= 1); // [0, 1]
```

Neighbors:

```ts
// Generic: outgoing targets for directed, all adjacent endpoints for undirected
Graph.neighbors(dag, 0); // [1]

// Directed-only (THROW GraphError on undirected graphs):
Graph.successors(dag, 0); // outgoing neighbors: [1]
Graph.predecessors(dag, 1); // incoming neighbors: [0]
```

- `Graph.neighborsDirected(graph, node, direction)` still exists but is **deprecated** as of 4.0 — use `successors` / `predecessors`.
- Directed neighbor lists have one entry per edge, so parallel edges yield duplicates; **undirected `neighbors` deduplicates** (a node with two parallel edges to the same peer reports it once; a self-loop reports the node itself once).
- There is no dedicated degree function — use `Graph.successors(g, n).length` (out-degree) and `Graph.predecessors(g, n).length` (in-degree), or `Graph.neighbors(g, n).length` for undirected.

## 4. Bulk Transformations

These run inside a mutation scope and modify the `MutableGraph` in place. Indices are preserved by the `map*` variants; the `filter*` variants remove (node removal also drops incident edges):

```ts
const transformed = Graph.mutate(dag, (m) => {
	Graph.mapNodes(m, (data) => data.toUpperCase()); // transform every node's data
	Graph.mapEdges(m, (w) => w * 10); // transform every edge's data
	Graph.filterNodes(m, (data) => data !== 'C'); // drop non-matching nodes (+ their edges)
	Graph.filterEdges(m, (w) => w >= 10); // drop non-matching edges
});

// filterMap variants: Option.some(next) keeps + transforms, Option.none() removes
import { Option } from 'effect';
const pruned = Graph.mutate(dag, (m) => {
	Graph.filterMapNodes(m, (data) =>
		data.startsWith('A') ? Option.some(data.toLowerCase()) : Option.none()
	);
	Graph.filterMapEdges(m, (w) => (w > 1 ? Option.some(w * 2) : Option.none()));
});

// Reverse every edge (swap source/target). No-op for undirected graphs.
const reversed = Graph.mutate(dag, (m) => {
	Graph.reverse(m);
});
```

## 5. Walkers: Lazy Iterators

Every traversal and listing API returns a `Graph.Walker<Index, Data>` — a lazy iterable of `[index, data]` pairs. Aliases: `Graph.NodeWalker<N> = Walker<NodeIndex, N>` and `Graph.EdgeWalker<E> = Walker<EdgeIndex, Edge<E>>`.

```ts
const walker = Graph.dfs(dag, { start: [0] });

// Project with the module helpers:
Array.from(Graph.indices(walker)); // [0, 1, 2] — just NodeIndex values
Array.from(Graph.values(walker)); // ['A', 'B', 'C'] — just node data
Array.from(Graph.entries(walker)); // [[0, 'A'], [1, 'B'], [2, 'C']]

// Or map each element directly:
Array.from(walker.visit((index, data) => ({ id: index, name: data })));

// Iterating the walker itself yields [index, data] tuples:
for (const [index, data] of walker) {
	console.log(index, data);
}
```

Walker semantics:

- **Re-iterable with fresh state** — each `for...of` / `Array.from` restarts the traversal from scratch.
- **Lazy** — the graph is read during iteration; elements removed since walker creation are skipped.

Listing walkers:

```ts
Graph.nodes(dag); // NodeWalker over all nodes in insertion order
Graph.edges(dag); // EdgeWalker over all edges in insertion order (data is the full Edge<E>)

// Boundary nodes: nodes with NO edges in the given direction
Graph.externals(dag, { direction: 'outgoing' }); // sinks (+ isolated nodes)
Graph.externals(dag, { direction: 'incoming' }); // sources (+ isolated nodes)
// direction defaults to 'outgoing' (sinks)
```

- On **undirected** graphs every incident edge appears in both adjacency directions, so `externals` yields only **isolated nodes** regardless of `direction` — find leaves with `Graph.neighbors(g, n).length === 1` instead.

## 6. Traversals: DFS, BFS, Postorder, Topological

`dfs`, `bfs`, and `dfsPostOrder` take a `SearchConfig`: `{ start?: Array<NodeIndex>; direction?: 'outgoing' | 'incoming' }`. All are dual and return a `NodeWalker<N>`:

```ts
// Preorder DFS from node 0, following outgoing edges (the default direction)
const down = Graph.dfs(dag, { start: [0] });

// Reverse traversal: everything that can REACH node 2
const up = Graph.dfs(dag, { start: [2], direction: 'incoming' });

// BFS: level order
const levels = Graph.bfs(dag, { start: [0] });

// Postorder: children emitted before parents (useful for bottom-up processing)
const bottomUp = Graph.dfsPostOrder(dag, { start: [0] });
```

- Omitting `start` (or passing `[]`) yields an **empty iterator** — traversals do not default to all nodes; seed them explicitly (multiple start nodes cover disconnected components).
- A missing start node **throws `GraphError`** at walker-creation time.
- `direction` is ignored for undirected graphs — both endpoints are always followed.
- Each node is visited at most once; cycles are safe.

Topological sort (`topo`) uses Kahn's algorithm and takes `TopoConfig`: `{ initials?: Array<NodeIndex> }`:

```ts
const order = Array.from(Graph.indices(Graph.topo(dag))); // [0, 1, 2]

// Prioritize specific zero in-degree nodes first; all nodes are still emitted
const prioritized = Graph.topo(dag, { initials: [0] });
```

`topo` **throws `GraphError`** when called on an undirected graph or a cyclic graph (`'Cannot perform topological sort on cyclic graph'`) — guard with `Graph.isAcyclic` first. An `initials` entry that has incoming edges throws `'Initial node N has incoming edges'` when iteration begins (not at creation).

## 7. Structure Analysis: Cycles, Components, Bipartite

```ts
Graph.isAcyclic(dag); // true — works on directed and undirected graphs

// Undirected only (type-restricted):
Graph.isBipartite(social); // BFS 2-coloring; odd cycles => false
Graph.connectedComponents(social); // Array<Array<NodeIndex>>, e.g. [[0, 1], [2, 3]]

// Directed only (THROWS GraphError on undirected):
Graph.stronglyConnectedComponents(dag); // Kosaraju's algorithm; Array<Array<NodeIndex>>
// In a DAG every node is its own SCC: three singleton components; output order is unspecified
```

`isAcyclic` is cached: fresh graphs are known-acyclic, the flag is invalidated when a mutation may change the answer (`addEdge` on a known-acyclic graph, removals on a known-cyclic graph) and unconditionally by `reverse`, and a computed result is memoized on the graph value. Repeated calls are cheap.

## 8. Shortest Paths

Point-to-point algorithms return `Option.Option<Graph.PathResult<E>>` where `PathResult` is:

```ts
interface PathResult<E> {
	readonly path: Array<NodeIndex>; // ordered nodes, source first, target last
	readonly distance: number; // total numeric cost
	readonly costs: Array<E>; // the EDGE DATA along the path — not numbers, unless E is number
}
```

All of them throw `GraphError` if `source` or `target` does not exist, and return `Option.none()` when the target is unreachable. `source === target` succeeds immediately with `{ path: [source], distance: 0, costs: [] }`. Undirected graphs are traversed symmetrically regardless of stored edge orientation.

```ts
const weighted = Graph.directed<string, number>((m) => {
	const a = Graph.addNode(m, 'A');
	const b = Graph.addNode(m, 'B');
	const c = Graph.addNode(m, 'C');
	Graph.addEdge(m, a, b, 5);
	Graph.addEdge(m, a, c, 10);
	Graph.addEdge(m, b, c, 2);
});

// Dijkstra — non-negative weights only
const shortest = Graph.dijkstra(weighted, {
	source: 0,
	target: 2,
	cost: (edgeData) => edgeData
});
// Option.some({ path: [0, 1, 2], distance: 7, costs: [5, 2] })

// A* — adds a heuristic over NODE data (estimate of remaining cost to target)
const grid = Graph.directed<{ x: number; y: number }, number>((m) => {
	const a = Graph.addNode(m, { x: 0, y: 0 });
	const b = Graph.addNode(m, { x: 1, y: 0 });
	const c = Graph.addNode(m, { x: 2, y: 0 });
	Graph.addEdge(m, a, b, 1);
	Graph.addEdge(m, b, c, 1);
});
const route = Graph.astar(grid, {
	source: 0,
	target: 2,
	cost: (edgeData) => edgeData,
	heuristic: (nodeData, targetData) =>
		Math.abs(nodeData.x - targetData.x) + Math.abs(nodeData.y - targetData.y)
});

// Bellman-Ford — negative weights allowed
const withNegatives = Graph.bellmanFord(weighted, {
	source: 0,
	target: 2,
	cost: (edgeData) => edgeData
});
// Option.none() if a negative cycle affects the path to target

// Floyd-Warshall — ALL pairs; takes a bare cost FUNCTION, not a config object
const all = Graph.floydWarshall(weighted, (edgeData) => edgeData);
all.distances.get(0)?.get(2); // 7 (Infinity when unreachable)
all.paths.get(0)?.get(2); // [0, 1, 2] (null when unreachable, [i] when i === j)
all.costs.get(0)?.get(2); // [5, 2] — edge data along the path
```

Sharp edges (all verified in tests):

- `dijkstra` and `astar` validate **every edge weight in the graph eagerly** — any negative or `NaN` cost throws `GraphError` immediately, even when the offending edge is not on the path and even when `source === target`.
- In **undirected** graphs every edge is traversable in both directions, so any reachable negative edge is a negative cycle: `bellmanFord` returns `Option.none()`, `floydWarshall` throws `'Negative cycle detected...'`.
- `floydWarshall` throws on any negative cycle in directed graphs too; it runs in O(V^3) — fine for hundreds of nodes, not tens of thousands.
- With parallel edges, `floydWarshall` uses the minimum weight between a pair.

## 9. Equality, Hashing & Inspection

Graphs implement `Equal` and `Hash`. Equality compares kind, then node data and edge data **by index** using `Equal.equals` (works with `Data`/`Schema` classes and plain primitives, including `undefined` data):

```ts
import { Equal } from 'effect';

Equal.equals(graph1, graph2);
// true only if: same kind, same node indices with equal data,
// same edge indices with equal Edge values
```

Because comparison is index-keyed, two structurally identical graphs built in a different insertion order (or after different removal histories) are **not** equal. Treat `Equal` as "same construction", not graph isomorphism.

Inspection:

```ts
String(dag); // 'Graph(directed, 3, 2)'
dag.toJSON(); // { _id: 'Graph', nodeCount: 3, edgeCount: 2, type: 'directed' }

// The graph itself iterates node entries:
for (const [index, data] of dag) {
	console.log(index, data);
}
```

## 10. Visualization: GraphViz & Mermaid

Both exporters are dual, work on directed and undirected graphs, and return a `string`. All options are optional — `Graph.toMermaid(dag)` works as-is; labels default to `String(data)`, the GraphViz name to `'G'`, the Mermaid direction to `'TD'`, and shapes to rectangle:

```ts
// GraphViz DOT. Options: { nodeLabel?, edgeLabel?, graphName? }
const dot = Graph.toGraphViz(dag, {
	nodeLabel: (data) => `Task: ${data}`,
	edgeLabel: (w) => `w=${w}`,
	graphName: 'Pipeline' // default 'G'
});
// digraph for directed ('->'), graph for undirected ('--'); labels are quote-escaped

// Mermaid. Options: { nodeLabel?, edgeLabel?, diagramType?, direction?, nodeShape? }
const mermaid = Graph.toMermaid(dag, {
	nodeLabel: (data) => data,
	edgeLabel: (w) => String(w),
	direction: 'LR', // 'TB' | 'TD' (default) | 'BT' | 'RL' | 'LR'
	nodeShape: (data) => (data === 'A' ? 'stadium' : 'rectangle')
});
// diagramType auto-detects: 'flowchart' (directed, '-->') vs 'graph' (undirected, '---')
```

`MermaidNodeShape` values: `'rectangle' | 'rounded' | 'circle' | 'diamond' | 'hexagon' | 'stadium' | 'subroutine' | 'cylindrical'`. Mermaid labels are escaped for special characters automatically; empty edge labels render plain arrows.

## Key Patterns

### Dependency graph with task ordering

`findNode` is O(n), so keep your own key-to-index map while building:

```ts
import { Graph } from 'effect';

interface Task {
	readonly name: string;
}

const byName = new Map<string, Graph.NodeIndex>();

const tasks = Graph.directed<Task, void>((m) => {
	const add = (name: string) => {
		const index = Graph.addNode(m, { name });
		byName.set(name, index);
		return index;
	};
	const compile = add('compile');
	const test = add('test');
	const lint = add('lint');
	const release = add('release');
	// edge A -> B means "A must run before B"
	Graph.addEdge(m, compile, test, undefined);
	Graph.addEdge(m, compile, lint, undefined);
	Graph.addEdge(m, test, release, undefined);
	Graph.addEdge(m, lint, release, undefined);
});

if (!Graph.isAcyclic(tasks)) {
	// Diagnose: every SCC with more than one node is a dependency cycle
	const cycles = Graph.stronglyConnectedComponents(tasks).filter(
		(scc) => scc.length > 1
	);
	throw new Error(`Dependency cycles: ${JSON.stringify(cycles)}`);
}

const executionOrder = Array.from(
	Graph.topo(tasks).visit((_, task) => task.name)
);
// ['compile', 'test', 'lint', 'release'] (or another valid topological order)
```

### Reachability and impact analysis

```ts
// Everything DOWNSTREAM of a node (what breaks if it changes):
const impacted = new Set(
	Graph.indices(Graph.dfs(tasks, { start: [byName.get('compile')!] }))
);

// Everything UPSTREAM of a node (its transitive prerequisites):
const prerequisites = new Set(
	Graph.indices(
		Graph.dfs(tasks, { start: [byName.get('release')!], direction: 'incoming' })
	)
);

// Entry points and leaves:
const roots = Array.from(Graph.indices(Graph.externals(tasks, { direction: 'incoming' })));
const leaves = Array.from(Graph.indices(Graph.externals(tasks, { direction: 'outgoing' })));
```

### Weighted routing with fallback

```ts
import { Graph, Option } from 'effect';

interface Link {
	readonly latencyMs: number;
}

const route = (
	network: Graph.UndirectedGraph<string, Link>,
	from: Graph.NodeIndex,
	to: Graph.NodeIndex
): Array<Graph.NodeIndex> =>
	Graph.dijkstra(network, {
		source: from,
		target: to,
		cost: (link) => link.latencyMs
	}).pipe(
		Option.map((result) => result.path),
		Option.getOrElse(() => [])
	);
```

### Wrapping throwing operations in Effect

Graph operations throw `GraphError` synchronously. Inside effectful code, capture them with `Effect.try` (the thrown value already is a tagged error; see the effect-error-handling skill for the broader strategy):

```ts
import { Effect, Graph } from 'effect';

const topoOrder = (g: Graph.DirectedGraph<string, number>) =>
	Effect.try({
		try: () => Array.from(Graph.indices(Graph.topo(g))),
		catch: (error) => error as Graph.GraphError
	});
// Effect<Array<Graph.NodeIndex>, Graph.GraphError>
```

### Derive a filtered subgraph view

```ts
// Keep only the active subset; incident edges of removed nodes are dropped automatically
const activeOnly = Graph.mutate(deployments, (m) => {
	Graph.filterNodes(m, (service) => service.status === 'active');
});
const clusters = Graph.connectedComponents(activeOnly); // undirected graphs
```

## Common Mistakes

1. **Calling `addNode`/`addEdge` on an immutable `Graph`** — write APIs require a `MutableGraph`, obtained only via the constructor callback, `Graph.mutate`, or `beginMutation`. The types reject it; restructure into a `mutate` scope.
2. **Expecting Effect-returning APIs** — the whole module is synchronous. Failures **throw** `GraphError` (`addEdge` with a missing endpoint, `topo` on cyclic/undirected graphs, `dijkstra`/`astar` on negative weights, missing traversal start nodes); lookups return `Option`. Wrap with `Effect.try` when inside effectful code.
3. **Passing `{ cost }` to `floydWarshall`** — it takes a bare cost function: `Graph.floydWarshall(graph, (edgeData) => edgeData)`. Only `dijkstra`/`astar`/`bellmanFord` take a `{ source, target, cost }` config object.
4. **Consuming a Walker as if it yielded indices** — `dfs`/`bfs`/`topo`/`nodes` walkers yield `[index, data]` tuples. Use `Graph.indices(w)`, `Graph.values(w)`, `Graph.entries(w)`, or `w.visit((i, d) => ...)` to project.
5. **Expecting traversals to cover the whole graph by default** — omitting `start` yields an empty iterator. Seed every component explicitly (`start: [a, b]`), or use `Graph.nodes` for plain enumeration.
6. **Using `neighborsDirected`** — deprecated in 4.0. Use `Graph.successors` (outgoing) / `Graph.predecessors` (incoming); all three throw `GraphError` on undirected graphs — use `Graph.neighbors` there.
7. **Reusing a `MutableGraph` after `endMutation`** — the returned immutable graph shares adjacency state with the mutable one; further writes corrupt the snapshot. Use `Graph.mutate`, which scopes the lifetime for you.
8. **Assuming a negative weight is fine if it is off the path** — `dijkstra` and `astar` validate every edge weight in the graph up front and throw `GraphError` for any negative/`NaN` cost, even when `source === target`. Use `bellmanFord` for negative weights.
9. **Negative edges in undirected graphs** — each undirected edge is traversable both ways, so any reachable negative edge forms a negative cycle: `bellmanFord` returns `Option.none()`, `floydWarshall` throws.
10. **Treating `Equal.equals` as graph isomorphism** — equality is index-keyed. Same structure built in a different order (different indices) compares unequal.
11. **Reading `PathResult.costs` as numbers** — `costs` holds the original edge data `E` along the path, not the output of your cost function. `distance` is the numeric total.
12. **Treating `NodeIndex` as an array offset** — indices are stable identifiers; after removals they are sparse and never reused, so `nodeCount` is not `max index + 1`. Iterate via `Graph.nodes`/`Graph.indices` instead of counting up.
13. **Relying on `updateNode`/`removeNode` to signal missing indices** — `updateNode`, `updateEdge`, `removeNode`, and `removeEdge` are silent no-ops for nonexistent indices; check `hasNode`/`hasEdge` first if absence is a bug.
14. **Passing `initials` with incoming edges to `topo`** — `initials` must be zero in-degree nodes; others throw `GraphError` when iteration starts. `initials` only prioritizes queue order — every node is still emitted exactly once.
