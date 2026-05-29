import { describe, test, expect } from 'vitest';
import { scanStructure, detectName, findDuplicateSiblings } from '../scan.ts';
import { ruleNode, withParent, fill, saReaction } from './factories.ts';
import type { RuleNode } from '../node.ts';

// ─── scanStructure: basic flags ────────────────────────────────────────────────

describe('scanStructure — hidden-layer', () => {
  test('flags hidden node', () => {
    const n = ruleNode({ id: 'n', visible: false });
    const issues = scanStructure(n);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('hidden-layer');
  });

  test('skips hidden node with component-controlled visibility', () => {
    const n = ruleNode({ id: 'n', visible: false, componentPropertyReferences: { visible: 'prop:1' } });
    expect(scanStructure(n)).toHaveLength(0);
  });

  test('skips locked node', () => {
    const n = ruleNode({ id: 'n', locked: true, visible: false });
    expect(scanStructure(n)).toHaveLength(0);
  });

  test('skips node with reactions', () => {
    const n = ruleNode({ id: 'n', visible: false, reactions: [{ trigger: { type: 'ON_CLICK' } }] });
    expect(scanStructure(n)).toHaveLength(0);
  });
});

describe('scanStructure — transparent-fill', () => {
  test('flags leaf node with only transparent fills', () => {
    const n = ruleNode({ id: 'n', fills: [{ type: 'SOLID', opacity: 0 }], children: [] });
    expect(scanStructure(n).map(i => i.type)).toContain('transparent-fill');
  });

  test('does NOT flag transparent-fill container with visible children', () => {
    const child = ruleNode({ id: 'c', fills: [fill()], children: [] });
    const parent = ruleNode({ id: 'p', fills: [{ type: 'SOLID', opacity: 0 }], children: [child] });
    child.parent = parent;
    const types = scanStructure(parent).map(i => i.type);
    expect(types).not.toContain('transparent-fill');
  });
});

describe('scanStructure — zero-size', () => {
  test('flags 0×0 leaf node', () => {
    const n = ruleNode({ id: 'n', width: 0, height: 0, children: [] });
    expect(scanStructure(n).map(i => i.type)).toContain('zero-size');
  });

  test('flags 0×0 clipping container', () => {
    const child = ruleNode({ id: 'c' });
    const parent = ruleNode({ id: 'p', width: 0, height: 0, clipsContent: true, children: [child] });
    child.parent = parent;
    expect(scanStructure(parent).map(i => i.type)).toContain('zero-size');
  });

  test('does NOT flag 0×0 non-clipping container with children', () => {
    const child = ruleNode({ id: 'c' });
    const parent = ruleNode({ id: 'p', width: 0, height: 0, clipsContent: false, children: [child] });
    child.parent = parent;
    const types = scanStructure(parent).map(i => i.type);
    expect(types).not.toContain('zero-size');
  });
});

describe('scanStructure — out-of-bounds', () => {
  test('flags node entirely outside clipping parent', () => {
    const parent = ruleNode({ id: 'p', type: 'FRAME', clipsContent: true, width: 100, height: 100, overflowDirection: 'NONE', children: [] });
    const child = ruleNode({ id: 'c', x: 200, y: 0, width: 50, height: 50, rotation: 0, parent });
    parent.children = [child];
    expect(scanStructure(parent).map(i => i.type)).toContain('out-of-bounds');
  });
});

describe('scanStructure — empty-text', () => {
  test('flags text node with empty characters', () => {
    const n = ruleNode({ id: 'n', type: 'TEXT', characters: '' });
    expect(scanStructure(n).map(i => i.type)).toContain('empty-text');
  });

  test('flags text node with whitespace-only characters', () => {
    const n = ruleNode({ id: 'n', type: 'TEXT', characters: '   ' });
    expect(scanStructure(n).map(i => i.type)).toContain('empty-text');
  });

  test('does not flag text with content', () => {
    const n = ruleNode({ id: 'n', type: 'TEXT', characters: 'Hello' });
    expect(scanStructure(n)).toHaveLength(0);
  });
});

describe('scanStructure — empty-vector', () => {
  test('flags vector with 0 vertices', () => {
    const n = ruleNode({ id: 'n', type: 'VECTOR', vectorVertexCount: 0 });
    expect(scanStructure(n).map(i => i.type)).toContain('empty-vector');
  });

  test('skips vector when vectorVertexCount is undefined (REST limitation)', () => {
    const n = ruleNode({ id: 'n', type: 'VECTOR' }); // no vectorVertexCount
    expect(scanStructure(n)).toHaveLength(0);
  });

  test('does not flag vector with vertices', () => {
    const n = ruleNode({ id: 'n', type: 'VECTOR', vectorVertexCount: 4 });
    expect(scanStructure(n)).toHaveLength(0);
  });
});

describe('scanStructure — detached-instance (D2)', () => {
  test('flags INSTANCE with null mainComponentId', () => {
    const n = ruleNode({ id: 'n', type: 'INSTANCE', mainComponentId: null });
    expect(scanStructure(n).map(i => i.type)).toContain('detached-instance');
  });

  test('flags INSTANCE with undefined mainComponentId', () => {
    const n = ruleNode({ id: 'n', type: 'INSTANCE' });
    expect(scanStructure(n).map(i => i.type)).toContain('detached-instance');
  });

  test('does not flag INSTANCE with valid mainComponentId', () => {
    const n = ruleNode({ id: 'n', type: 'INSTANCE', mainComponentId: 'comp:1' });
    expect(scanStructure(n)).toHaveLength(0);
  });
});

describe('scanStructure — empty-container', () => {
  test('flags empty childless frame with no chrome', () => {
    const n = ruleNode({ id: 'n', children: [] });
    expect(scanStructure(n).map(i => i.type)).toContain('empty-container');
  });

  test('does NOT flag childless frame with visible fill (leaf visual element)', () => {
    const n = ruleNode({ id: 'n', fills: [fill()], children: [] });
    expect(scanStructure(n)).toHaveLength(0);
  });
});

describe('scanStructure — single-child-group', () => {
  test('flags single-child GROUP with no mask/opacity/effects', () => {
    const child = ruleNode({ id: 'c', children: [], fills: [fill()] });
    const group = ruleNode({ id: 'g', type: 'GROUP', children: [child] });
    child.parent = group;
    withParent(group);
    expect(scanStructure(group).map(i => i.type)).toContain('single-child-group');
  });

  test('does NOT flag group with effect', () => {
    const child = ruleNode({ id: 'c', children: [], fills: [fill()] });
    const group = ruleNode({ id: 'g', type: 'GROUP', children: [child], effects: [{ type: 'DROP_SHADOW', visible: true }] });
    child.parent = group;
    withParent(group);
    expect(scanStructure(group).map(i => i.type)).not.toContain('single-child-group');
  });
});

describe('scanStructure — SECTION/COMPONENT_SET passthrough', () => {
  test('does not flag SECTION itself, scans children', () => {
    const child = ruleNode({ id: 'c', visible: false });
    const section = ruleNode({ id: 's', type: 'SECTION', children: [child] });
    child.parent = section;
    const issues = scanStructure(section);
    // SECTION itself is not flagged, but its hidden child is
    expect(issues.some(i => i.type === 'hidden-layer')).toBe(true);
    expect(issues.every(i => i.id !== 's')).toBe(true);
  });
});

describe('scanStructure — layersFreed', () => {
  test('hidden parent counts descendants', () => {
    const grandchild = ruleNode({ id: 'gc' });
    const child = ruleNode({ id: 'c', children: [grandchild] });
    grandchild.parent = child;
    const parent = ruleNode({ id: 'p', visible: false, children: [child] });
    child.parent = parent;
    const issues = scanStructure(parent);
    expect(issues[0].layersFreed).toBe(3); // parent + child + grandchild
  });
});

// ─── detectName ───────────────────────────────────────────────────────────────

describe('detectName', () => {
  test('returns null for clean name', () => {
    expect(detectName(ruleNode({ name: 'HeroSection', type: 'FRAME' }))).toBeNull();
  });

  test('returns default for generic name', () => {
    expect(detectName(ruleNode({ name: 'Frame 1' }))?.reason).toBe('default');
  });

  test('returns smart-animate-match when in SA frame', () => {
    const page = ruleNode({ type: 'PAGE', parent: null });
    const top = ruleNode({ type: 'FRAME', parent: page, reactions: [saReaction()] });
    page.children = [top];
    const child = ruleNode({ name: 'Frame 1', parent: top });
    top.children = [child];
    const result = detectName(child);
    expect(result?.reason).toBe('smart-animate-match');
    expect(result?.severity).toBe('info');
  });
});

// ─── findDuplicateSiblings ────────────────────────────────────────────────────

describe('findDuplicateSiblings', () => {
  test('finds siblings with the same name', () => {
    const a = ruleNode({ id: 'a', name: 'Card' });
    const b = ruleNode({ id: 'b', name: 'Card' });
    const root = ruleNode({ id: 'r', children: [a, b] });
    a.parent = root; b.parent = root;
    const dups = findDuplicateSiblings(root);
    expect(dups).toHaveLength(2);
    expect(dups.every(d => d.count === 2)).toBe(true);
  });

  test('ignores numbered series siblings ("Item 1", "Item 2")', () => {
    const a = ruleNode({ id: 'a', name: 'Item 1' });
    const b = ruleNode({ id: 'b', name: 'Item 2' });
    const root = ruleNode({ id: 'r', children: [a, b] });
    a.parent = root; b.parent = root;
    expect(findDuplicateSiblings(root)).toHaveLength(0);
  });

  test('ignores locked siblings', () => {
    const a = ruleNode({ id: 'a', name: 'Card', locked: true });
    const b = ruleNode({ id: 'b', name: 'Card', locked: true });
    const root = ruleNode({ id: 'r', children: [a, b] });
    a.parent = root; b.parent = root;
    expect(findDuplicateSiblings(root)).toHaveLength(0);
  });

  test('ignores INSTANCE siblings', () => {
    const a = ruleNode({ id: 'a', name: 'Card', type: 'INSTANCE' });
    const b = ruleNode({ id: 'b', name: 'Card', type: 'INSTANCE' });
    const root = ruleNode({ id: 'r', children: [a, b] });
    a.parent = root; b.parent = root;
    expect(findDuplicateSiblings(root)).toHaveLength(0);
  });

  test('skips duplicates inside Smart Animate frame', () => {
    const page = ruleNode({ type: 'PAGE', parent: null });
    const top = ruleNode({ type: 'FRAME', parent: page, reactions: [saReaction()] });
    page.children = [top];
    const a = ruleNode({ id: 'a', name: 'Hero', parent: top });
    const b = ruleNode({ id: 'b', name: 'Hero', parent: top });
    top.children = [a, b];
    expect(findDuplicateSiblings(top)).toHaveLength(0);
  });

  test('unique siblings are not flagged', () => {
    const a = ruleNode({ id: 'a', name: 'Header' });
    const b = ruleNode({ id: 'b', name: 'Footer' });
    const root = ruleNode({ id: 'r', children: [a, b] });
    a.parent = root; b.parent = root;
    expect(findDuplicateSiblings(root)).toHaveLength(0);
  });
});
