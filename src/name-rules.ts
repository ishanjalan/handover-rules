// Name-issue classification — detection only, no inference.
// Runs identically in the plugin and the REST audit.

import type { RuleNode, NameReason } from './node.ts';
import {
  GENERIC_NAME_RE, LOCALIZED_GENERIC_RE, LOW_INFO_RE, COPY_SUFFIX_RE,
  isNonStandardCase,
} from './strings.ts';

export type NameDetection = { reason: NameReason; severity: 'error' | 'warning' | 'info' };

// Decorative/icon nodes: pure vector shapes with no text content. Renaming them
// produces noise (e.g. "Vector 3 → icon") with no real handoff value.
// This is why the plugin never flags "Line 1"/"Vector 1".
export function isDecorativeNode(node: RuleNode): boolean {
  if (node.type === 'LINE' || node.type === 'VECTOR') return true;
  if (node.type === 'BOOLEAN_OPERATION') {
    return !node.children.some((c) => c.type === 'TEXT');
  }
  return false;
}

// True when the node lives inside a COMPONENT tree (not an instance).
// Used to downgrade severity to 'info' — partially-built components are expected to be messy.
export function isInsideComponent(node: RuleNode): boolean {
  let current: RuleNode | null = node.parent;
  while (current) {
    if (current.type === 'COMPONENT') return true;
    if (current.type === 'PAGE' || current.type === 'DOCUMENT') return false;
    current = current.parent;
  }
  return false;
}

// Returns true when `node` lives inside a top-level frame that has at least one
// outgoing Smart Animate prototype transition. Such layers are Smart Animate
// match candidates — Figma pairs them with layers of the same name in the
// destination frame, so auto-renaming one side without the other silently breaks
// the animation.
//
// Limitation (v1): only outgoing transitions are checked.
export function isInSmartAnimateFrame(node: RuleNode): boolean {
  // Walk up to the direct child of the PAGE (the top-level frame).
  let current: RuleNode | null = node.parent;
  let topFrame: RuleNode | null = null;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (
      (current.type === 'FRAME' || current.type === 'COMPONENT') &&
      (current.parent?.type === 'PAGE' || current.parent?.type === 'DOCUMENT')
    ) {
      topFrame = current;
      break;
    }
    current = current.parent;
  }
  if (!topFrame) return false;

  return topFrame.reactions.some(
    (r) => r.action?.type === 'NODE' && r.action?.transition?.type === 'SMART_ANIMATE',
  );
}

// Returns the detection category for a node's name, or null if no issue.
// Classification only — no inference, no Smart-Animate override (caller adds that).
export function detectNameIssue(node: RuleNode): NameDetection | null {
  if (isDecorativeNode(node)) return null;
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') return null;

  const name = node.name.trim();

  if (GENERIC_NAME_RE.test(name) || LOCALIZED_GENERIC_RE.test(name)) {
    return { reason: 'default', severity: isInsideComponent(node) ? 'info' : 'warning' };
  }
  if (COPY_SUFFIX_RE.test(name)) return { reason: 'copy-suffix', severity: 'warning' };
  if (LOW_INFO_RE.test(name))    return { reason: 'low-info',    severity: 'warning' };
  if (name.length <= 2 && /^[a-z]+$/i.test(name)) return { reason: 'short', severity: 'info' };
  if ((node.type === 'FRAME' || node.type === 'GROUP') && isNonStandardCase(name)) {
    return { reason: 'non-standard-case', severity: 'info' };
  }

  return null;
}

// True when a name ends with a trailing number — these are intentional numbered series
// (e.g. "Item 1", "Item 2") and are not considered duplicates.
export function isNumberedSeries(name: string): boolean {
  return /\s+\d+$/.test(name.trim());
}

// True when a node should be included in duplicate-sibling detection.
// Mirrors the skip logic in the plugin's checkDuplicateSiblings.
export function shouldConsiderForDuplicate(node: RuleNode): boolean {
  if (node.locked) return false;
  if (node.type === 'INSTANCE' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') return false;
  if (isNumberedSeries(node.name)) return false;
  return true;
}
