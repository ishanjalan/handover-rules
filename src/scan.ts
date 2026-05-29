// Tree-walk + per-node classification over RuleNode.
// Port of Handover plugin's scanner.ts scanNode and names.ts checkDuplicateSiblings,
// with all Figma-API references replaced by typed RuleNode access.

import type { RuleNode, Issue, NameReason } from './node.ts';
import {
  hasVisibleFill, hasStroke, hasEffects, hasOnlyTransparentFills,
  isPassthroughFrame, isWrapperFrame, isRedundantFrame,
  isCompletelyOutOfBounds, isDetachedInstance,
} from './structure-rules.ts';
import {
  detectNameIssue, isInSmartAnimateFrame, isNumberedSeries, shouldConsiderForDuplicate,
} from './name-rules.ts';

// INSTANCES: fix the source component, not individual copies. BOOLEAN_OPERATION
// children are shape operands — flagging them would break the combined shape.
// Both are handled individually (detached-instance before early-return for INSTANCE)
// then skipped without recursion.
const SKIP_TYPES = new Set(['INSTANCE', 'BOOLEAN_OPERATION']);

export function getPath(node: RuleNode): string {
  const parts: string[] = [];
  let current = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(' › ');
}

export function countDescendants(node: RuleNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

// ─── STRUCTURAL RULE — subtree deletion safety ─────────────────────────────────
//
// Several checks below delete the flagged node AND its entire descendant subtree.
// This is only correct when the invisible property CASCADES:
//
//   CASCADING (safe to delete subtree):
//     hidden-layer  → visibility propagates to all descendants
//     zero-opacity  → opacity propagates to all descendants
//     out-of-bounds → parent clip makes all descendants invisible
//
//   NODE-LOCAL (fills, dimensions — do NOT cascade):
//     transparent-fill → fills are not inherited; children render on their own
//     zero-size        → 0×0 dimensions don't hide children when clipsContent=false
//
// NODE-LOCAL checks must NEVER delete a container that has visible children.
// Each such check below is explicitly guarded: it only fires on leaf nodes or
// on containers that are proven to clip their children to nothing.

function scanNodeInto(node: RuleNode, issues: Issue[]): void {
  // Organisational containers — pass through to children without flagging the
  // container itself. SECTION is a file-organisation tool; COMPONENT_SET wraps variants.
  if (node.type === 'SECTION' || node.type === 'COMPONENT_SET') {
    for (const child of node.children) {
      scanNodeInto(child, issues);
    }
    return;
  }

  // Locked nodes are pinned by the designer — never flag or touch them.
  if (node.locked) return;

  // Nodes with prototype reactions may be invisible hotspots (e.g. a hidden
  // frame used as a tap target). Flagging them would silently break flows.
  if (node.reactions.length > 0) return;

  // Nodes with export settings are intentionally authored for export — even if
  // hidden, the designer chose to configure them and we must not touch them.
  if (node.exportSettings.length > 0) return;

  // Nodes with annotations are intentional design notes or spec markers.
  if (node.annotations.length > 0) return;

  // ── Invisible by toggle (CASCADING) ───────────────────────────────────────
  // Checked BEFORE SKIP_TYPES so that hidden instances are caught. The
  // SKIP_TYPES guard exists to prevent descending into instance/boolean
  // internals for structural checks — but the node *itself* being hidden is
  // always dead weight regardless of type.

  if (!node.visible) {
    // If visibility is driven by a component boolean property it is an
    // intentional toggleable state, not dead weight — skip it.
    if (node.componentPropertyReferences?.['visible']) return;

    issues.push({
      id: node.id, type: 'hidden-layer',
      name: node.name, nodeType: node.type,
      path: getPath(node),
      layersFreed: 1 + countDescendants(node),
    });
    return;
  }

  // INSTANCE: check for detached before the generic SKIP_TYPES early-return.
  if (node.type === 'INSTANCE') {
    if (isDetachedInstance(node)) {
      issues.push({
        id: node.id, type: 'detached-instance',
        name: node.name, nodeType: node.type,
        path: getPath(node),
        layersFreed: 1 + countDescendants(node),
      });
    }
    return; // never recurse into instance internals
  }

  // INSTANCES and BOOLEAN_OPERATION children are handled above (INSTANCE) or skipped.
  if (SKIP_TYPES.has(node.type)) return;

  // NODE-LOCAL: fills don't cascade to children. A frame with a transparent
  // background is still a valid layout container — its children are visible.
  // Only flag leaf nodes (no children) to avoid deleting visible content.
  if (hasOnlyTransparentFills(node) && !hasStroke(node) && !hasEffects(node)) {
    const hasKids = node.children.length > 0;
    if (!hasKids) {
      issues.push({
        id: node.id, type: 'transparent-fill',
        name: node.name, nodeType: node.type,
        path: getPath(node),
        layersFreed: 1,
      });
      return;
    }
    // Container with transparent fills but visible children — fall through so
    // children are scanned individually.
  }

  // ── Invisible by geometry ──────────────────────────────────────────────────

  // NODE-LOCAL: 0×0 dimensions only guarantee invisible children when the frame
  // clips its content. Without clipping, children can extend beyond the 0×0
  // bounds and remain fully visible. Only flag when there are no children, or
  // when clipsContent ensures the zero area actually clips them.
  if (Number.isFinite(node.width) && Number.isFinite(node.height)) {
    if (node.width === 0 && node.height === 0 && !hasStroke(node)) {
      const hasKids = node.children.length > 0;
      const clipsKids = hasKids && node.clipsContent;
      if (!hasKids || clipsKids) {
        issues.push({
          id: node.id, type: 'zero-size',
          name: node.name, nodeType: node.type,
          path: getPath(node),
          layersFreed: 1 + countDescendants(node),
        });
        return;
      }
      // Container has children and doesn't clip — fall through to scan children.
    }
  }

  // Out-of-bounds: entirely outside a clipping parent's visible area.
  const parent = node.parent;
  if (parent && parent.type === 'FRAME' && isCompletelyOutOfBounds(node, parent)) {
    issues.push({
      id: node.id, type: 'out-of-bounds',
      name: node.name, nodeType: node.type,
      path: getPath(node),
      layersFreed: 1 + countDescendants(node),
    });
    return;
  }

  // Empty text: no characters or whitespace-only — common after design iteration.
  if (node.type === 'TEXT') {
    const chars = node.characters ?? '';
    if (chars.trim() === '') {
      issues.push({
        id: node.id, type: 'empty-text',
        name: node.name, nodeType: node.type,
        path: getPath(node),
        layersFreed: 1,
      });
    }
    return;
  }

  // Empty vector: no vertices — left behind after cancelling a pen-tool path.
  // vectorVertexCount is undefined on REST (rule skips gracefully).
  if (node.type === 'VECTOR') {
    if (node.vectorVertexCount !== undefined && node.vectorVertexCount === 0) {
      issues.push({
        id: node.id, type: 'empty-vector',
        name: node.name, nodeType: node.type,
        path: getPath(node),
        layersFreed: 1,
      });
    }
    return;
  }

  // ── Structural nesting ─────────────────────────────────────────────────────

  if (node.children.length === 0) {
    // A childless frame/group that has visible fills, strokes, or effects
    // is a leaf visual element (e.g. a solid or image background block).
    // It is NOT empty — it renders something on its own — so leave it alone.
    if (hasVisibleFill(node) || hasStroke(node) || hasEffects(node)) return;
    issues.push({
      id: node.id, type: 'empty-container',
      name: node.name, nodeType: node.type,
      path: getPath(node),
      layersFreed: 1,
    });
    return;
  }

  // Single-child GROUP with no mask — the group wrapper is pure overhead.
  // Guard: group-level opacity, blend mode, and effects are applied to the
  // flattened composite, not to individual children. Dissolving would silently
  // drop them, changing the visual. Only dissolve when the group is visually
  // neutral (full opacity, normal blend, no effects).
  if (
    node.type === 'GROUP' &&
    node.children.length === 1 &&
    !node.isMask &&
    !node.children[0].isMask &&
    node.opacity === 1 &&
    (!node.blendMode || node.blendMode === 'NORMAL') &&
    !hasEffects(node)
  ) {
    issues.push({
      id: node.id, type: 'single-child-group',
      name: node.name, nodeType: node.type,
      path: getPath(node),
      layersFreed: 1,
    });
    scanNodeInto(node.children[0], issues);
    return;
  }

  // Auto-layout passthrough frame.
  if (isPassthroughFrame(node)) {
    issues.push({
      id: node.id, type: 'passthrough-frame',
      name: node.name, nodeType: node.type,
      path: getPath(node),
      layersFreed: 1,
    });
    scanNodeInto(node.children[0], issues);
    return;
  }

  // Wrapper frame.
  if (isWrapperFrame(node)) {
    issues.push({
      id: node.id, type: 'wrapper-frame',
      name: node.name, nodeType: node.type,
      path: getPath(node),
      layersFreed: 1,
    });
    for (const child of node.children) {
      scanNodeInto(child, issues);
    }
    return;
  }

  // Redundant single-child frame (mixed-layout gap, non-auto-layout parent).
  if (isRedundantFrame(node)) {
    issues.push({
      id: node.id, type: 'redundant-frame',
      name: node.name, nodeType: node.type,
      path: getPath(node),
      layersFreed: 1,
    });
    scanNodeInto(node.children[0], issues);
    return;
  }

  // GROUP inside an auto-layout frame: groups don't participate in auto-layout
  // sizing and always behave as fixed HUG containers, breaking the layout math.
  // Single-child groups are already caught above; this catches multi-child ones.
  // Guard: skip mask groups, ABSOLUTE-positioned overlay groups, and groups
  // with group-level opacity/blend-mode/effects (same reasoning as above).
  if (
    node.type === 'GROUP' &&
    parent?.type === 'FRAME' &&
    parent.layoutMode !== 'NONE' &&
    node.layoutPositioning !== 'ABSOLUTE' &&
    !node.isMask &&
    !node.children.some((c) => c.isMask) &&
    node.opacity === 1 &&
    (!node.blendMode || node.blendMode === 'NORMAL') &&
    !hasEffects(node)
  ) {
    issues.push({
      id: node.id, type: 'group-in-autolayout',
      name: node.name, nodeType: node.type,
      path: getPath(node),
      layersFreed: 1,
    });
    for (const child of node.children) {
      scanNodeInto(child, issues);
    }
    return;
  }

  for (const child of node.children) {
    scanNodeInto(child, issues);
  }
}

// Scan a subtree for structural issues. Call once per top-level frame (or page child).
export function scanStructure(root: RuleNode): Issue[] {
  const issues: Issue[] = [];
  scanNodeInto(root, issues);
  return issues;
}

// ─── Name detection ────────────────────────────────────────────────────────────

export type NameDetection = { reason: NameReason; severity: 'error' | 'warning' | 'info' };

// Wraps detectNameIssue and applies the Smart-Animate override:
// if a node would be flagged AND isInSmartAnimateFrame(node), return smart-animate-match.
export function detectName(node: RuleNode): NameDetection | null {
  const base = detectNameIssue(node);
  if (!base) return null;
  if (isInSmartAnimateFrame(node)) {
    return { reason: 'smart-animate-match', severity: 'info' };
  }
  return base;
}

// ─── Duplicate-sibling detection ───────────────────────────────────────────────
//
// Walks the tree to find siblings that share the same name. These are missed by
// the per-node scan because the name itself isn't generic — the repetition is what
// makes it wrong. Returns one entry per duplicate node with the total sibling count.

export function findDuplicateSiblings(
  root: RuleNode,
): Array<{ node: RuleNode; count: number }> {
  const results: Array<{ node: RuleNode; count: number }> = [];

  function walk(node: RuleNode): void {
    // Transparent containers — pass through.
    if (node.type === 'SECTION') {
      for (const child of node.children) walk(child);
      return;
    }
    // Don't look inside instances or decorative nodes.
    if (node.type === 'INSTANCE') return;
    if (node.children.length === 0) return;

    // Build a name → nodes map, skipping design-system and numbered-series children.
    const nameMap = new Map<string, RuleNode[]>();
    for (const child of node.children) {
      if (!shouldConsiderForDuplicate(child)) continue;
      const list = nameMap.get(child.name) ?? [];
      list.push(child);
      nameMap.set(child.name, list);
    }

    for (const [, nodes] of nameMap) {
      if (nodes.length < 2) continue;
      for (const dupNode of nodes) {
        // Duplicate siblings inside a Smart Animate frame may be intentional
        // match targets — skip rather than proposing a rename.
        if (isInSmartAnimateFrame(dupNode)) continue;
        results.push({ node: dupNode, count: nodes.length });
      }
    }

    for (const child of node.children) walk(child);
  }

  walk(root);
  return results;
}

// Re-export helpers for consumers that need them independently.
export { isNumberedSeries, shouldConsiderForDuplicate } from './name-rules.ts';
