// Test fixtures — plain RuleNode objects.
// Only populate the fields each test's function under test actually reads.

import type { RuleNode, RulePaint, RuleEffect, RuleReaction } from '../node.ts';

export function ruleNode(props: Partial<RuleNode> & { type?: string } = {}): RuleNode {
  return {
    id: 'n1',
    name: 'Frame',
    type: 'FRAME',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'NORMAL',
    x: 0, y: 0, width: 100, height: 100,
    rotation: 0,
    layoutMode: 'NONE',
    layoutSizingHorizontal: 'HUG',
    layoutSizingVertical: 'HUG',
    layoutPositioning: 'AUTO',
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    clipsContent: false,
    fills: [],
    strokes: [],
    effects: [],
    reactions: [],
    exportSettings: [],
    annotations: [],
    parent: null,
    children: [],
    ...props,
  };
}

// Wire a child to a parent, mutating both sides.
export function withParent(child: RuleNode, parentProps: Partial<RuleNode> = {}): RuleNode {
  const parent = ruleNode({ id: 'p1', ...parentProps });
  child.parent = parent;
  if (!parent.children.includes(child)) {
    parent.children = [...parent.children, child];
  }
  return child;
}

export function fill(props: Partial<RulePaint> = {}): RulePaint {
  return { type: 'SOLID', visible: true, ...props };
}

export function effect(props: Partial<RuleEffect> = {}): RuleEffect {
  return { type: 'DROP_SHADOW', visible: true, ...props };
}

export function saReaction(): RuleReaction {
  return { action: { type: 'NODE', transition: { type: 'SMART_ANIMATE' } } };
}
