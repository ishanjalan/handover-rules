import { describe, test, expect } from 'vitest';
import {
  hasVisibleFill, hasStroke, hasEffects, hasOnlyTransparentFills,
  isPassthroughFrame, isWrapperFrame, isRedundantFrame, isCompletelyOutOfBounds,
  isDetachedInstance,
} from '../structure-rules.ts';
import { ruleNode, withParent, fill, effect } from './factories.ts';

// ─── hasVisibleFill ────────────────────────────────────────────────────────────

describe('hasVisibleFill', () => {
  test('true for visible solid fill', () => {
    expect(hasVisibleFill(ruleNode({ fills: [fill()] }))).toBe(true);
  });

  test('false for hidden fill', () => {
    expect(hasVisibleFill(ruleNode({ fills: [fill({ visible: false })] }))).toBe(false);
  });

  test('false for empty fills', () => {
    expect(hasVisibleFill(ruleNode({ fills: [] }))).toBe(false);
  });
});

// ─── hasStroke ────────────────────────────────────────────────────────────────

describe('hasStroke', () => {
  test('true for visible stroke with weight', () => {
    expect(hasStroke(ruleNode({ strokes: [fill()], strokeWeight: 1 }))).toBe(true);
  });

  test('false for zero-weight stroke', () => {
    expect(hasStroke(ruleNode({ strokes: [fill()], strokeWeight: 0 }))).toBe(false);
  });

  test('false for hidden stroke', () => {
    expect(hasStroke(ruleNode({ strokes: [fill({ visible: false })], strokeWeight: 2 }))).toBe(false);
  });
});

// ─── hasEffects ───────────────────────────────────────────────────────────────

describe('hasEffects', () => {
  test('true for visible effect', () => {
    expect(hasEffects(ruleNode({ effects: [effect()] }))).toBe(true);
  });

  test('false for hidden effect', () => {
    expect(hasEffects(ruleNode({ effects: [effect({ visible: false })] }))).toBe(false);
  });

  test('false for no effects', () => {
    expect(hasEffects(ruleNode({ effects: [] }))).toBe(false);
  });
});

// ─── hasOnlyTransparentFills ──────────────────────────────────────────────────

describe('hasOnlyTransparentFills', () => {
  test('true for fill with opacity 0', () => {
    const n = ruleNode({ fills: [fill({ opacity: 0 })] });
    expect(hasOnlyTransparentFills(n)).toBe(true);
  });

  test('true for hidden fill', () => {
    const n = ruleNode({ fills: [fill({ visible: false })] });
    expect(hasOnlyTransparentFills(n)).toBe(true);
  });

  test('true for gradient with all-zero alpha stops', () => {
    const n = ruleNode({ fills: [{ type: 'GRADIENT_LINEAR', gradientStops: [{ color: { a: 0 } }] }] });
    expect(hasOnlyTransparentFills(n)).toBe(true);
  });

  test('false for visible opaque fill', () => {
    expect(hasOnlyTransparentFills(ruleNode({ fills: [fill()] }))).toBe(false);
  });

  test('false for no fills', () => {
    expect(hasOnlyTransparentFills(ruleNode({ fills: [] }))).toBe(false);
  });

  test('IMAGE fill is always opaque', () => {
    const n = ruleNode({ fills: [{ type: 'IMAGE' }] });
    expect(hasOnlyTransparentFills(n)).toBe(false);
  });
});

// ─── isPassthroughFrame ───────────────────────────────────────────────────────

describe('isPassthroughFrame', () => {
  function makePassthrough() {
    const child = ruleNode({ id: 'c', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG' });
    const wrapper = ruleNode({
      id: 'w', type: 'FRAME', layoutMode: 'VERTICAL',
      layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
      children: [child],
    });
    child.parent = wrapper;
    const parent = ruleNode({
      id: 'p', type: 'FRAME', layoutMode: 'VERTICAL',
      children: [wrapper],
    });
    wrapper.parent = parent;
    return wrapper;
  }

  test('true for valid passthrough', () => {
    expect(isPassthroughFrame(makePassthrough())).toBe(true);
  });

  test('false when not a FRAME', () => {
    const n = ruleNode({ type: 'GROUP', layoutMode: 'VERTICAL' });
    expect(isPassthroughFrame(n)).toBe(false);
  });

  test('false when has fill', () => {
    const wrapper = makePassthrough();
    wrapper.fills = [fill()];
    expect(isPassthroughFrame(wrapper)).toBe(false);
  });

  test('false when FIXED sizing', () => {
    const wrapper = makePassthrough();
    wrapper.layoutSizingHorizontal = 'FIXED';
    expect(isPassthroughFrame(wrapper)).toBe(false);
  });

  test('false when layoutMode is NONE', () => {
    const wrapper = makePassthrough();
    wrapper.layoutMode = 'NONE';
    expect(isPassthroughFrame(wrapper)).toBe(false);
  });

  test('false when HUG wrapper around FILL child (progress-bar bug)', () => {
    const child = ruleNode({ id: 'c', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG' });
    const wrapper = ruleNode({
      id: 'w', type: 'FRAME', layoutMode: 'HORIZONTAL',
      layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
      children: [child],
    });
    child.parent = wrapper;
    const parent = ruleNode({ id: 'p', type: 'FRAME', layoutMode: 'HORIZONTAL', children: [wrapper] });
    wrapper.parent = parent;
    expect(isPassthroughFrame(wrapper)).toBe(false);
  });
});

// ─── isWrapperFrame ───────────────────────────────────────────────────────────

describe('isWrapperFrame', () => {
  function makeWrapper(tierA: boolean) {
    const parent = ruleNode({ id: 'p', type: 'FRAME', layoutMode: 'NONE', width: 200, height: 200 });
    const child = ruleNode({ id: 'c', constraints: { horizontal: 'MIN', vertical: 'MIN' } });
    const wrapper = ruleNode({
      id: 'w', type: 'FRAME', layoutMode: 'NONE',
      x: tierA ? 0 : 10, y: tierA ? 0 : 10,
      width: tierA ? 200 : 100, height: tierA ? 200 : 100,
      children: [child],
      parent,
    });
    child.parent = wrapper;
    parent.children = [wrapper];
    return wrapper;
  }

  test('true for Tier A (fills parent exactly)', () => {
    expect(isWrapperFrame(makeWrapper(true))).toBe(true);
  });

  test('true for Tier B (all children MIN×MIN)', () => {
    expect(isWrapperFrame(makeWrapper(false))).toBe(true);
  });

  test('false when has fill', () => {
    const w = makeWrapper(true);
    w.fills = [fill()];
    expect(isWrapperFrame(w)).toBe(false);
  });

  test('false when parent is auto-layout', () => {
    const w = makeWrapper(true);
    w.parent!.layoutMode = 'VERTICAL';
    expect(isWrapperFrame(w)).toBe(false);
  });
});

// ─── isRedundantFrame ─────────────────────────────────────────────────────────

describe('isRedundantFrame', () => {
  function makeRedundant() {
    // Non-auto-layout single-child frame inside a larger non-auto-layout parent.
    // Parent is 400×400 so the wrapper (100×100, offset) is NOT a WrapperFrame Tier A.
    // Child has no MIN×MIN constraints, so it's not WrapperFrame Tier B either.
    const child = ruleNode({ id: 'c', x: 0, y: 0, width: 100, height: 100 });
    const wrapper = ruleNode({
      id: 'w', type: 'FRAME', layoutMode: 'NONE', children: [child],
      x: 10, y: 10, width: 100, height: 100,
    });
    child.parent = wrapper;
    const parent = ruleNode({ id: 'p', type: 'FRAME', layoutMode: 'NONE', children: [wrapper], width: 400, height: 400 });
    wrapper.parent = parent;
    return wrapper;
  }

  test('true for non-AL single-child frame inside non-AL parent', () => {
    expect(isRedundantFrame(makeRedundant())).toBe(true);
  });

  test('false when has cornerRadius', () => {
    const w = makeRedundant();
    w.cornerRadius = 8;
    expect(isRedundantFrame(w)).toBe(false);
  });

  test('false when has fill', () => {
    const w = makeRedundant();
    w.fills = [fill()];
    expect(isRedundantFrame(w)).toBe(false);
  });

  test('false when has padding', () => {
    const w = makeRedundant();
    w.paddingTop = 8;
    expect(isRedundantFrame(w)).toBe(false);
  });
});

// ─── isCompletelyOutOfBounds ──────────────────────────────────────────────────

describe('isCompletelyOutOfBounds', () => {
  function makeClippingParent() {
    return ruleNode({ type: 'FRAME', clipsContent: true, width: 100, height: 100, overflowDirection: 'NONE' });
  }

  test('true when entirely to the right of parent', () => {
    const parent = makeClippingParent();
    const node = ruleNode({ x: 110, y: 0, width: 50, height: 50, rotation: 0 });
    node.parent = parent;
    expect(isCompletelyOutOfBounds(node, parent)).toBe(true);
  });

  test('true when entirely above parent', () => {
    const parent = makeClippingParent();
    const node = ruleNode({ x: 0, y: -60, width: 50, height: 50, rotation: 0 });
    node.parent = parent;
    expect(isCompletelyOutOfBounds(node, parent)).toBe(true);
  });

  test('false when partially overlapping', () => {
    const parent = makeClippingParent();
    const node = ruleNode({ x: 80, y: 0, width: 50, height: 50, rotation: 0 });
    node.parent = parent;
    expect(isCompletelyOutOfBounds(node, parent)).toBe(false);
  });

  test('false when parent does not clip', () => {
    const parent = ruleNode({ type: 'FRAME', clipsContent: false, width: 100, height: 100 });
    const node = ruleNode({ x: 200, y: 0, width: 50, height: 50, rotation: 0 });
    expect(isCompletelyOutOfBounds(node, parent)).toBe(false);
  });

  test('false when node is rotated (can\'t use local coords)', () => {
    const parent = makeClippingParent();
    const node = ruleNode({ x: 110, y: 0, width: 50, height: 50, rotation: 45 });
    expect(isCompletelyOutOfBounds(node, parent)).toBe(false);
  });

  test('false when parent scrolls horizontally and node is to the right', () => {
    const parent = ruleNode({ type: 'FRAME', clipsContent: true, width: 100, height: 100, overflowDirection: 'HORIZONTAL' });
    const node = ruleNode({ x: 200, y: 0, width: 50, height: 50, rotation: 0 });
    expect(isCompletelyOutOfBounds(node, parent)).toBe(false);
  });
});

// ─── isDetachedInstance ───────────────────────────────────────────────────────

describe('isDetachedInstance', () => {
  test('true when mainComponentId is null', () => {
    expect(isDetachedInstance(ruleNode({ type: 'INSTANCE', mainComponentId: null }))).toBe(true);
  });

  test('true when mainComponentId is undefined', () => {
    expect(isDetachedInstance(ruleNode({ type: 'INSTANCE' }))).toBe(true);
  });

  test('false when mainComponentId is set', () => {
    expect(isDetachedInstance(ruleNode({ type: 'INSTANCE', mainComponentId: 'comp:1' }))).toBe(false);
  });

  test('false for non-INSTANCE nodes', () => {
    expect(isDetachedInstance(ruleNode({ type: 'FRAME' }))).toBe(false);
  });
});
