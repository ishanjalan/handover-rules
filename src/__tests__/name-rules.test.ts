import { describe, test, expect } from 'vitest';
import { isDecorativeNode, isInsideComponent, isInSmartAnimateFrame, detectNameIssue } from '../name-rules.ts';
import { ruleNode, withParent, saReaction } from './factories.ts';

// ─── isDecorativeNode ──────────────────────────────────────────────────────────

describe('isDecorativeNode', () => {
  test('LINE and VECTOR are decorative', () => {
    expect(isDecorativeNode(ruleNode({ type: 'LINE' }))).toBe(true);
    expect(isDecorativeNode(ruleNode({ type: 'VECTOR' }))).toBe(true);
  });

  test('BOOLEAN_OPERATION with no TEXT child is decorative', () => {
    const child = ruleNode({ type: 'RECTANGLE' });
    const bo = ruleNode({ type: 'BOOLEAN_OPERATION', children: [child] });
    expect(isDecorativeNode(bo)).toBe(true);
  });

  test('BOOLEAN_OPERATION with TEXT child is NOT decorative', () => {
    const text = ruleNode({ type: 'TEXT' });
    const bo = ruleNode({ type: 'BOOLEAN_OPERATION', children: [text] });
    expect(isDecorativeNode(bo)).toBe(false);
  });

  test('FRAME is not decorative', () => {
    expect(isDecorativeNode(ruleNode({ type: 'FRAME' }))).toBe(false);
  });
});

// ─── isInsideComponent ────────────────────────────────────────────────────────

describe('isInsideComponent', () => {
  test('false when node has no parent', () => {
    expect(isInsideComponent(ruleNode({ parent: null }))).toBe(false);
  });

  test('true when direct parent is COMPONENT', () => {
    const child = ruleNode({ name: 'inner' });
    withParent(child, { type: 'COMPONENT' });
    expect(isInsideComponent(child)).toBe(true);
  });

  test('true when ancestor is COMPONENT', () => {
    const child = ruleNode({ name: 'deep' });
    const mid = ruleNode({ name: 'mid', parent: null });
    child.parent = mid;
    const comp = ruleNode({ type: 'COMPONENT', parent: null });
    mid.parent = comp;
    expect(isInsideComponent(child)).toBe(true);
  });

  test('false when ancestor is only FRAME', () => {
    const child = ruleNode({ name: 'inner' });
    withParent(child, { type: 'FRAME' });
    expect(isInsideComponent(child)).toBe(false);
  });

  test('stops at PAGE (returns false)', () => {
    const page = ruleNode({ type: 'PAGE', parent: null });
    const frame = ruleNode({ type: 'FRAME', parent: page });
    const child = ruleNode({ parent: frame });
    expect(isInsideComponent(child)).toBe(false);
  });
});

// ─── isInSmartAnimateFrame ────────────────────────────────────────────────────

describe('isInSmartAnimateFrame', () => {
  function makeTopLevel(hasSmartAnimate: boolean) {
    const page = ruleNode({ type: 'PAGE', id: 'page', parent: null });
    const topFrame = ruleNode({ type: 'FRAME', id: 'top', parent: page,
      reactions: hasSmartAnimate ? [saReaction()] : [] });
    page.children = [topFrame];
    const child = ruleNode({ type: 'FRAME', id: 'child', parent: topFrame });
    topFrame.children = [child];
    return child;
  }

  test('true when inside top-level frame with Smart Animate', () => {
    expect(isInSmartAnimateFrame(makeTopLevel(true))).toBe(true);
  });

  test('false when top-level frame has no Smart Animate', () => {
    expect(isInSmartAnimateFrame(makeTopLevel(false))).toBe(false);
  });

  test('false when node is orphan (no parent)', () => {
    expect(isInSmartAnimateFrame(ruleNode({ parent: null }))).toBe(false);
  });

  test('false when reaction is DISSOLVE (not Smart Animate)', () => {
    const page = ruleNode({ type: 'PAGE', parent: null });
    const top = ruleNode({ type: 'FRAME', parent: page,
      reactions: [{ action: { type: 'NODE', transition: { type: 'DISSOLVE' } } }] });
    const child = ruleNode({ parent: top });
    expect(isInSmartAnimateFrame(child)).toBe(false);
  });
});

// ─── detectNameIssue ──────────────────────────────────────────────────────────

describe('detectNameIssue', () => {
  test('null for COMPONENT/COMPONENT_SET', () => {
    expect(detectNameIssue(ruleNode({ type: 'COMPONENT', name: 'Frame 1' }))).toBeNull();
    expect(detectNameIssue(ruleNode({ type: 'COMPONENT_SET', name: 'Frame 1' }))).toBeNull();
  });

  test('null for decorative nodes (LINE/VECTOR)', () => {
    // The bug: audit wrongly flagged "Line 1" and "Vector 1" as generic names.
    // The shared isDecorativeNode guard must suppress this.
    expect(detectNameIssue(ruleNode({ type: 'LINE', name: 'Line 1' }))).toBeNull();
    expect(detectNameIssue(ruleNode({ type: 'VECTOR', name: 'Vector 1' }))).toBeNull();
  });

  test('default reason for generic names (Frame N, Group N, etc.)', () => {
    expect(detectNameIssue(ruleNode({ name: 'Frame 1' }))?.reason).toBe('default');
    expect(detectNameIssue(ruleNode({ name: 'Group 23' }))?.reason).toBe('default');
    expect(detectNameIssue(ruleNode({ name: 'Rectangle 5' }))?.reason).toBe('default');
  });

  test('default reason for localized generic names (non-ASCII scripts)', () => {
    // Korean/CJK defaults — LOCALIZED_GENERIC_RE matches non-ASCII Unicode scripts.
    // "Cadre"/"Rahmen" are pure ASCII so they fall through to non-standard-case instead.
    expect(detectNameIssue(ruleNode({ name: '프레임 5' }))?.reason).toBe('default');  // Korean
    expect(detectNameIssue(ruleNode({ name: '框架 3' }))?.reason).toBe('default');     // Chinese
  });

  test('copy-suffix reason', () => {
    expect(detectNameIssue(ruleNode({ name: 'Frame copy 12' }))?.reason).toBe('copy-suffix');
  });

  test('low-info reason', () => {
    expect(detectNameIssue(ruleNode({ name: 'temp' }))?.reason).toBe('low-info');
    expect(detectNameIssue(ruleNode({ name: 'test 2' }))?.reason).toBe('low-info');
    expect(detectNameIssue(ruleNode({ name: 'untitled' }))?.reason).toBe('low-info');
  });

  test('short reason for 1–2 alpha char names', () => {
    expect(detectNameIssue(ruleNode({ name: 'ab' }))?.reason).toBe('short');
    expect(detectNameIssue(ruleNode({ name: 'a' }))?.reason).toBe('short');
  });

  test('non-standard-case for FRAME/GROUP with bad casing', () => {
    expect(detectNameIssue(ruleNode({ type: 'FRAME', name: 'hero section' }))?.reason).toBe('non-standard-case');
    expect(detectNameIssue(ruleNode({ type: 'GROUP', name: 'my group' }))?.reason).toBe('non-standard-case');
  });

  test('null for properly named PascalCase frame', () => {
    expect(detectNameIssue(ruleNode({ type: 'FRAME', name: 'HeroSection' }))).toBeNull();
  });

  test('info severity for generic name inside component', () => {
    const child = ruleNode({ name: 'Frame 1' });
    withParent(child, { type: 'COMPONENT' });
    const result = detectNameIssue(child);
    expect(result?.severity).toBe('info');
  });

  test('warning severity for generic name outside component', () => {
    expect(detectNameIssue(ruleNode({ name: 'Frame 1' }))?.severity).toBe('warning');
  });

  // Section must NOT be flagged — audit's original GENERIC_NAME_RE wrongly included it.
  test('null for "Section 1" — Section nodes are never flagged for naming', () => {
    expect(detectNameIssue(ruleNode({ type: 'SECTION', name: 'Section 1' }))).toBeNull();
  });
});
