# handover-rules

Shared Figma layer-quality detection rules used by two tools:

- **[Handover](https://github.com/ishanjalan/handover)** — a Figma plugin designers run before handoff
- **[figma-audit](https://github.com/ishanjalan/figma-audit)** — a CI bot that audits files automatically when they're marked "Ready for dev"

The rules live here once. Both tools include this repo as a git submodule and each wraps it with a thin adapter that converts their native data format (live Figma API nodes vs. REST JSON) into the common `RuleNode` interface, then runs the same detection code.

---

## What gets checked

### Structural issues

These are problems that generate dead weight in the layer tree — nodes that render nothing, frames that add nesting without purpose, or components that will break in dev inspect.

| Issue type | What it means |
|---|---|
| `hidden-layer` | Layer is invisible (`visible: false`) and not bound to a component toggle prop |
| `transparent-fill` | Frame has fills but every fill is hidden or at zero opacity |
| `zero-size` | Frame or element has zero width or height |
| `out-of-bounds` | Node sits entirely outside its clipping parent's visible area |
| `empty-container` | Frame/group/component has no children and no visual fill (renders nothing) |
| `empty-text` | Text node with no content |
| `empty-vector` | Vector node with no vertices |
| `detached-instance` | Instance whose master component has been deleted — will show as broken in dev inspect |
| `single-child-group` | Group with exactly one child — the group wrapper is pure overhead |
| `group-in-autolayout` | Group sitting inside an auto-layout frame — groups don't participate in AL sizing, breaking layout math |
| `passthrough-frame` | Auto-layout frame inside another auto-layout frame, no chrome, same direction — the wrapper adds nothing |
| `wrapper-frame` | Non-AL frame with no visual properties acting as a pure positional wrapper for its children |
| `redundant-frame` | Single-child frame with no visual identity — exists only to add a nesting level |

**Skip signals** — nodes with any of the following are never flagged, because they have intentional design context:
- `reactions` (prototype interactions)
- `exportSettings` (configured for export)
- `annotations` (design spec markers)
- `componentPropertyReferences` (visibility bound to a component boolean prop)
- `locked: true`

---

### Naming issues

These flag layer names that will produce unreadable or broken output when code is generated from the design.

| Reason | What it means | Example |
|---|---|---|
| `default` | Figma's auto-generated name — the designer never renamed it | `Frame 12`, `Group 4`, `Rectangle 1` |
| `low-info` | Short, meaningless token that conveys no design intent | `bg`, `div`, `c1` |
| `copy-suffix` | Name ends with Figma's copy suffix, meaning it's a forgotten duplicate | `Button Copy`, `Card 2 Copy` |
| `short` | Two-character lowercase name — not enough to infer meaning | `ok`, `ab` |
| `duplicate-sibling` | Two or more siblings share the exact same name | Two frames both called `Card` inside the same parent |
| `non-standard-case` | Frame or group name isn't PascalCase — inconsistent with the project convention | `hero cta`, `redDeal`, `CONTAINER` |
| `smart-animate-match` | Frame sits inside a Smart Animate prototype transition — renaming it would break the animation | (shown as a warning, not auto-renamed) |

**Decorative nodes** (LINE, VECTOR, BOOLEAN_OPERATION) are never flagged for naming — they're icon shapes and renaming them produces noise.

**Severity** — every name issue has a severity:
- `error` — (reserved for future use)
- `warning` — actionable, rename recommended
- `info` — inside a component definition or an edge case; worth reviewing but lower priority

---

## How it works

```
Your data source
(Figma live API  OR  Figma REST JSON)
         │
         ▼
   rule-adapter.ts          ← you write this per-consumer
   (converts to RuleNode)
         │
         ▼
   handover-rules           ← lives here
   ┌─────────────────────┐
   │  structure-rules.ts │  ← the predicates (isPassthroughFrame, etc.)
   │  name-rules.ts      │  ← name classification
   │  scan.ts            │  ← tree walker, calls the rules, returns Issue[]
   └─────────────────────┘
         │
         ▼
     Issue[]
```

The only contract is `RuleNode` — a plain TypeScript interface with no Figma API types. See [`src/node.ts`](src/node.ts) for the full definition.

---

## Adding a new rule

### 1. Add a new `IssueType` in `src/node.ts`

```typescript
export type IssueType =
  | 'empty-container'
  | 'hidden-layer'
  // ... existing types ...
  | 'your-new-rule';   // ← add here
```

### 2. Write the predicate in `src/structure-rules.ts` (or `name-rules.ts`)

```typescript
// Returns true when the node has the problem you're detecting.
export function isYourNewRule(node: RuleNode): boolean {
  if (node.type !== 'FRAME') return false;
  // your logic here
  return someCondition;
}
```

The predicate receives a fully-wired `RuleNode` — you can read `node.parent`, walk `node.children`, and check any property defined on the interface. No Figma API imports.

### 3. Call it in `src/scan.ts`

Find the `scanNodeInto` function and add your check at the right point in the priority order:

```typescript
// After the existing skip guards...
if (isYourNewRule(node)) {
  issues.push({
    id: node.id,
    type: 'your-new-rule',
    name: node.name,
    nodeType: node.type,
    path: getPath(node),
    layersFreed: 0,
  });
  return;   // if the node should not be recursed into after flagging
}
```

The scan order matters — checks earlier in the function take priority. Hidden nodes are caught first (so their children aren't separately flagged), instances are caught before their internals are walked, etc.

### 4. Export from `src/index.ts`

If you want consumers to be able to call your predicate directly (e.g. for re-validation before applying a fix), export it:

```typescript
export { isYourNewRule } from './structure-rules.ts';
```

### 5. Write a test in `src/__tests__/`

```typescript
import { describe, test, expect } from 'vitest';
import { isYourNewRule } from '../structure-rules.ts';
import { ruleNode } from './factories.ts';

describe('isYourNewRule', () => {
  test('flags when condition is met', () => {
    const node = ruleNode({ type: 'FRAME', /* ... */ });
    expect(isYourNewRule(node)).toBe(true);
  });

  test('does not flag when safe', () => {
    const node = ruleNode({ type: 'FRAME', /* ... */ });
    expect(isYourNewRule(node)).toBe(false);
  });
});
```

Run `npm test` to confirm.

### 6. Handle it in consumers

After adding a new `IssueType`, each consumer needs to handle it:

**Handover plugin** (`src/plugin/fixer.ts`):
```typescript
case 'your-new-rule':
  node.remove(); // or whatever the fix is
  result.fixed++;
  break;
```

**Handover plugin** (`src/ui/App.svelte`) — add to the local `IssueType` union:
```typescript
type IssueType = ... | 'your-new-rule';
```

**figma-audit** (`src/pin-comments.ts`) — add to `structureBreakdown`:
```typescript
structureBreakdown: {
  ...
  'your-new-rule': 0,
}
```

---

## Project structure

```
src/
├── node.ts             RuleNode interface + IssueType + NameReason + Issue
├── strings.ts          String helpers: toKebab, toPascal, isNonStandardCase, etc.
├── structure-rules.ts  Structural predicates: isPassthroughFrame, isWrapperFrame, etc.
├── name-rules.ts       Name predicates: detectNameIssue, isDecorativeNode, etc.
├── scan.ts             Public API: scanStructure(), detectName(), findDuplicateSiblings()
├── index.ts            Barrel re-exports
└── __tests__/
    ├── factories.ts            ruleNode() and helpers for building test fixtures
    ├── strings.test.ts
    ├── structure-rules.test.ts
    ├── name-rules.test.ts
    └── scan.test.ts
```

---

## Development

```bash
npm install
npm test          # run all tests (vitest)
npm run typecheck # tsc --noEmit
```

The package has no runtime dependencies — only `typescript` and `vitest` as dev deps. It must stay that way: no Figma API imports, no DOM, no Node.js built-ins.
