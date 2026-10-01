// Structure-issue predicates — ported verbatim from Handover plugin's scanner.ts.
// All Figma-API type guards replaced with direct typed RuleNode access.

import type { RuleNode } from './node.ts';

export function hasVisibleFill(node: RuleNode): boolean {
  return node.fills.some((f) => f.visible !== false);
}

export function hasStroke(node: RuleNode): boolean {
  if (!node.strokes.some((s) => s.visible !== false)) return false;
  // A stroke with zero weight renders nothing — treat as no stroke
  if (node.strokeWeight !== undefined && node.strokeWeight === 0) return false;
  return true;
}

// Returns true when every fill on the node is invisible at the paint level —
// either explicitly hidden, at opacity 0, or (for gradients) every stop is
// fully transparent. IMAGE fills are always treated as opaque.
export function hasOnlyTransparentFills(node: RuleNode): boolean {
  if (node.fills.length === 0) return false;
  return node.fills.every((fill) => {
    if (fill.visible === false) return true;
    if ((fill.opacity ?? 1) === 0) return true;
    if (fill.type === 'IMAGE') return false;
    if (fill.type.startsWith('GRADIENT')) {
      return (fill.gradientStops ?? []).every((stop) => stop.color.a === 0);
    }
    return false;
  });
}

export function hasEffects(node: RuleNode): boolean {
  return node.effects.some((e) => e.visible !== false);
}

// A frame is a passthrough when it is a transparent auto-layout wrapper sitting
// inside another auto-layout frame. Its child can safely bubble up because
// auto-layout recalculates positions — no x/y correction needed.
//
// Sizing safety — per axis, the WRAPPER's sizing must be compatible with the
// CHILD's sizing so the child's effective size doesn't change when moved out:
//
//   Wrapper HUG + Child HUG    ✓ child's natural size is preserved
//   Wrapper HUG + Child FIXED  ✓ child keeps its fixed size
//   Wrapper HUG + Child FILL   ✗ HUG wrapper was isolating the FILL — dissolving
//                                 would let the child resolve against the
//                                 grandparent's (potentially larger) dimension
//                                 (this is the Graphic/Group 135 progress-bar bug)
//   Wrapper FILL + Child FILL  ✓ both fill the grandparent — same end dimension
//   Wrapper FILL + Child HUG   ✗ dissolving and transferring FILL to child would
//                                 inflate the child from its natural size to
//                                 the grandparent's size
//   Wrapper FILL + Child FIXED ✗ same concern as HUG: losing the wrapper's
//                                 FILL role changes how siblings share space
//   Wrapper FIXED + *          ✗ fixed wrappers may be constraining the child
export function isPassthroughFrame(node: RuleNode): boolean {
  if (node.type !== 'FRAME') return false;

  if (node.layoutMode === 'NONE') return false;
  // Grid cells are positioned by row/column, not by flow — a grid wrapper is never a passthrough.
  if (node.layoutMode === 'GRID') return false;
  if (node.children.length !== 1) return false;
  if (hasVisibleFill(node) || hasStroke(node) || hasEffects(node)) return false;
  if (node.opacity !== 1) return false;
  if (node.clipsContent) return false;
  if (
    node.paddingTop !== 0 || node.paddingBottom !== 0 ||
    node.paddingLeft !== 0 || node.paddingRight !== 0
  ) return false;

  const parent = node.parent;
  if (!parent || parent.type !== 'FRAME') return false;
  if (parent.layoutMode === 'NONE') return false;

  // Dissolving across a layoutMode change swaps the child's primary and cross axes.
  if (parent.layoutMode !== node.layoutMode) return false;

  // An absolutely-positioned frame is an overlay in the parent's auto-layout.
  // Dissolving it would pull the child into the auto-layout flow — unsafe.
  if (node.layoutPositioning === 'ABSOLUTE') return false;

  const h = node.layoutSizingHorizontal;
  const v = node.layoutSizingVertical;
  if (h === 'FIXED' || v === 'FIXED') return false;

  // Inspect the child's sizing — a HUG wrapper around a FILL child is the
  // single most common cause of unintended size changes on dissolve.
  const child = node.children[0];
  const ch = child.layoutSizingHorizontal;
  const cv = child.layoutSizingVertical;
  if (!ch || !cv) {
    // Child type doesn't expose sizing modes (rare). Bail conservatively.
    return false;
  }

  // Per-axis match: HUG wrapper is safe over HUG/FIXED child; FILL wrapper is
  // only safe over FILL child.
  const axisSafe = (w: string, c: string): boolean =>
    w === 'HUG' ? c === 'HUG' || c === 'FIXED' : c === 'FILL';

  if (!axisSafe(h ?? 'HUG', ch)) return false;
  if (!axisSafe(v ?? 'HUG', cv)) return false;

  return true;
}

// A wrapper frame is a non-auto-layout FRAME with no visual properties, no
// clipping, and no rotation — acting as a pure positional wrapper for its
// children. We support two safety tiers:
//   Tier A — frame fills its parent exactly: dissolving preserves all child
//             constraint behaviour regardless of constraint type.
//   Tier B — frame is offset from its parent: only MIN×MIN children are safe,
//             because x/y correction (child.x += frame.x) only works for offset
//             constraints. CENTER, SCALE, STRETCH, MAX compute relative to the
//             frame bounds and would misplace children after dissolving.
export function isWrapperFrame(node: RuleNode): boolean {
  if (node.type !== 'FRAME') return false;

  if (node.layoutMode !== 'NONE') return false;
  if (node.children.length === 0) return false;
  if (hasVisibleFill(node) || hasStroke(node) || hasEffects(node)) return false;
  if (node.opacity !== 1) return false;
  if (node.clipsContent) return false;
  if (node.rotation !== 0) return false;

  const parent = node.parent;
  if (!parent || parent.type !== 'FRAME') return false;
  if (parent.layoutMode !== 'NONE') return false;
  // A rotated parent changes what MIN×MIN constraints mean for position
  // correction — unsafe to dissolve.
  if (parent.rotation !== 0) return false;

  // Tier A: frame fills its parent exactly — child constraints are irrelevant
  // because the coordinate origin and bounds don't change after dissolving.
  const tierA =
    Math.abs(node.x) < 0.5 &&
    Math.abs(node.y) < 0.5 &&
    Math.abs(node.width - parent.width) < 0.5 &&
    Math.abs(node.height - parent.height) < 0.5;

  if (tierA) return true;

  // Tier B: offset frame — all children must have MIN×MIN constraints so that
  // the x/y position correction (child.x += frame.x, child.y += frame.y) is
  // the only adjustment needed to maintain absolute position.
  return node.children.every((child) => {
    if (!child.constraints) return false;
    return child.constraints.horizontal === 'MIN' && child.constraints.vertical === 'MIN';
  });
}

// Child exactly fills the wrapper, and the wrapper's auto-layout sizing can be
// transferred to the child without changing its resolved size.
function isLosslessInAutoLayout(frame: RuleNode): boolean {
  if (frame.children.length !== 1) return false;
  const child = frame.children[0];

  if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return false;
  if (Math.abs(child.x) > 0.5 || Math.abs(child.y) > 0.5) return false;
  if (Math.abs(child.width - frame.width) > 0.5) return false;
  if (Math.abs(child.height - frame.height) > 0.5) return false;

  // Absolute overlay keeps its own flow slot — don't dissolve.
  if (frame.layoutPositioning === 'ABSOLUTE') return false;

  // Per-axis sizing safety (mirrors isPassthroughFrame): forbid HUG wrapper over
  // a FILL child, which would let the child resolve against the grandparent.
  const wh = frame.layoutSizingHorizontal;
  const wv = frame.layoutSizingVertical;
  const chS = child.layoutSizingHorizontal;
  const cvS = child.layoutSizingVertical;
  if (!chS || !cvS) return false;

  // A FIXED wrapper owns the width. A FILL/HUG child inside it resolves against that
  // width; once the wrapper is gone, setting the child FIXED keeps only the child's
  // stale stored size (e.g. a FILL text that last measured 56px), so the content
  // reflows. Only a child that is already FIXED on that axis survives unchanged.
  const axisSafe = (w: string, c: string): boolean =>
    w === 'FIXED' ? c === 'FIXED' : w === 'HUG' ? c === 'HUG' || c === 'FIXED' : c === 'FILL';
  if (!axisSafe(wh ?? 'HUG', chS) || !axisSafe(wv ?? 'HUG', cvS)) return false;

  return true;
}

// A single-child FRAME with no visual identity that exists only to add a nesting
// level — the mixed-layoutMode case that isPassthroughFrame (auto-layout in
// auto-layout) and isWrapperFrame (none in none) deliberately skip.
//
// v1 scope: parent must NOT be auto-layout, so the child's absolute geometry is
// preserved by an x/y correction. The fixer's fidelity guard verifies the result.
export function isRedundantFrame(node: RuleNode): boolean {
  if (node.type !== 'FRAME') return false;

  if (node.children.length !== 1) return false;
  if (node.layoutMode === 'GRID') return false;

  if (hasVisibleFill(node) || hasStroke(node) || hasEffects(node)) return false;
  if (node.opacity !== 1) return false;
  if (node.clipsContent) return false;
  if (node.rotation !== 0) return false;
  if ((node.cornerRadius ?? 0) > 0) return false;

  if (
    node.paddingTop !== 0 || node.paddingBottom !== 0 ||
    node.paddingLeft !== 0 || node.paddingRight !== 0
  ) return false;

  if (node.layoutPositioning === 'ABSOLUTE') return false;

  // Strict passthrough/wrapper frames have dedicated, safer fixers — don't double-handle.
  if (isPassthroughFrame(node) || isWrapperFrame(node)) return false;

  const parent = node.parent;
  if (!parent) return false;

  // An auto-layout wrapper that sizes a FILL child: outside auto layout the child cannot
  // fill anything, so it freezes at whatever stale size it last stored.
  if (node.layoutMode !== 'NONE') {
    const c = node.children[0];
    if (c.layoutSizingHorizontal === 'FILL' || c.layoutSizingVertical === 'FILL') return false;
  }

  // v1 path: GROUP or non-auto-layout container — child keeps absolute geometry.
  if (parent.type === 'GROUP') return true;
  if (parent.type === 'FRAME' || parent.type === 'COMPONENT') {
    if (parent.layoutMode === 'NONE') return true;
    // Dissolving into a grid would drop the child's cell placement.
    if (parent.layoutMode === 'GRID') return false;

    // v2 path: auto-layout parent. Only safe when the collapse is provably lossless
    // — the child must already fill the wrapper exactly so no reflow occurs, and
    // sizing must transfer without the HUG-over-FILL inflation risk.
    return isLosslessInAutoLayout(node);
  }
  return false;
}

// A node is out-of-bounds when it sits inside a clipping frame but lies
// entirely outside that frame's visible area. It renders nothing but still
// occupies layer panel space.
export function isCompletelyOutOfBounds(node: RuleNode, parent: RuleNode): boolean {
  if (!parent.clipsContent) return false;

  // Rotated nodes have visual bounds that differ from their local x/y/width/height
  // (which are pre-rotation). Using pre-rotation coords could flag visible content
  // as out-of-bounds. Skip the check entirely for rotated nodes.
  if (node.rotation !== 0) return false;

  // Guard against NaN/non-finite geometry (can arise from REST null bbox defaults).
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y) ||
      !Number.isFinite(node.width) || !Number.isFinite(node.height) ||
      !Number.isFinite(parent.width) || !Number.isFinite(parent.height)) return false;

  // Scrollable frames clip their content but children intentionally extend beyond
  // the visible area in the scroll direction — those nodes are not dead weight.
  const scrollDir = parent.overflowDirection ?? 'NONE';
  const scrollsH = scrollDir === 'HORIZONTAL' || scrollDir === 'BOTH';
  const scrollsV = scrollDir === 'VERTICAL' || scrollDir === 'BOTH';

  const oobH = !scrollsH && (node.x >= parent.width || node.x + node.width <= 0);
  const oobV = !scrollsV && (node.y >= parent.height || node.y + node.height <= 0);
  return oobH || oobV;
}

// An INSTANCE whose master component is gone — will break in dev inspect.
export function isDetachedInstance(node: RuleNode): boolean {
  if (node.type !== 'INSTANCE') return false;
  return node.mainComponentId === null || node.mainComponentId === undefined;
}
