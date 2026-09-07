---
action: context
tool: (edit|write)
event: after
name: avoid-react-hooks
description: Review React hooks (useState, useEffect, useReducer, etc.) for state and effects better expressed with Effect Atom
glob: '**/*.{ts,tsx}'
detector: ast
pattern:
    - 'useState($$$)'
    - 'useState<$$$>($$$)'
    - 'useEffect($$$)'
    - 'useEffect<$$$>($$$)'
    - 'useReducer($$$)'
    - 'useReducer<$$$>($$$)'
    - 'useCallback($$$)'
    - 'useCallback<$$$>($$$)'
    - 'useMemo($$$)'
    - 'useMemo<$$$>($$$)'
    - 'useRef($$$)'
    - 'useRef<$$$>($$$)'
    - 'useLayoutEffect($$$)'
    - 'useImperativeHandle($$$)'
    - 'useDebugValue($$$)'
    - 'useDeferredValue($$$)'
    - 'useTransition($$$)'
    - 'useId($$$)'
    - 'useSyncExternalStore($$$)'
    - 'useInsertionEffect($$$)'
level: high
suggestSkills:
    - effect-atom-state
---

# Review React Hooks - Prefer Effect Atom for Shared State

Keep shared state in atoms and application effects in typed Effect services.
Components subscribe with `useAtomValue` and trigger actions with `useAtomSet`
or `useAtom`. Organize atoms in ordinary state modules alongside the feature.

| Hook usage | Effect Atom alternative |
| --- | --- |
| `useState` / `useReducer` for shared state | Writable `Atom.make` values |
| `useMemo` for shared derived state | `Atom.map` or a derived `Atom.make` |
| `useEffect` to fetch data | `Atom.runtime(layer).atom(effect)` |
| Async action callbacks with manual loading state | `Atom.fn` or runtime actions with `AsyncResult` |
| External subscriptions owned by an atom | `Atom.make` with `get.addFinalizer` |
| URL search state | `Atom.searchParam` |

The detector is advisory: hooks for DOM refs, layout, React scheduling, stable
IDs, or local component behavior may be appropriate. Review the hook's role
before replacing it; atoms are not substitutes for React-specific lifecycle APIs.

Load `effect-atom-state` for implementation guidance.
