import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-react-hooks",
  tag: "avoid-react-hooks",
  shouldMatch: [
    "const [count, setCount] = useState(0)",
    "const [state, setState] = useState<User>()",
    "useEffect(() => { fetch() }, [])",
    "useEffect(() => cleanup, [dep])",
    "const [state, dispatch] = useReducer(reducer, init)",
    "const callback = useCallback(() => {}, [deps])",
    "const memoized = useMemo(() => compute(), [x])",
    "const ref = useRef(null)",
    "const ref = useRef<HTMLDivElement>(null)",
    "useLayoutEffect(() => {}, [])",
    "useImperativeHandle(ref, () => ({}))",
    "useDebugValue(value)",
    "const deferred = useDeferredValue(value)",
    "const [isPending, startTransition] = useTransition()",
    "const id = useId()",
    "useSyncExternalStore(subscribe, getSnapshot)",
    "useInsertionEffect(() => {}, [])"
  ],
  shouldNotMatch: [
    "const state = Atom.make(0)",
    "const runtime = Atom.runtime(AppLayer)",
    "useAtomValue(stateAtom)",
    "const value = Atom.get(atom)",
    "Effect.gen(function* () {})",
    "const derived = Atom.map(sourceAtom, fn)",
    "// useState is mentioned in a comment",
    "const customUseState = () => {}",
    "const useStateManager = createManager()",
    // String / template / comment content mentioning hook names
    "const hint = 'avoid useState in Effect apps'",
    'const doc = "useEffect should not be used"',
    "const tmpl = `migrate away from useMemo`",
    "/* useRef is a react hook */ const x = 1",
    // Imports of hooks (imports alone are not yet calls)
    "import { useState } from 'react'"
  ]
})
