import { describe, test, expect } from 'vitest';
import {
  toKebab, toPascal, isPascalCase, isNonStandardCase, dedupeWords,
  looksLikeData, isPlaceholderText,
} from '../strings.ts';

describe('toKebab', () => {
  test('basic cases', () => {
    expect(toKebab('How it works')).toBe('how-it-works');
    expect(toKebab('redDeal')).toBe('red-deal');
    expect(toKebab('CONTAINER')).toBe('container');
    expect(toKebab('hero CTA')).toBe('hero-cta');
  });

  test('strips articles', () => {
    expect(toKebab('The header')).toBe('header');
    expect(toKebab('A button')).toBe('button');
  });

  test('collapses separators', () => {
    expect(toKebab('ab--cd')).toBe('ab-cd');
    expect(toKebab('ab  cd')).toBe('ab-cd');
  });

  test('truncates to 32 chars', () => {
    const long = 'a very long name that definitely exceeds thirty two characters';
    expect(toKebab(long).length).toBeLessThanOrEqual(32);
  });
});

describe('dedupeWords', () => {
  test('removes adjacent duplicates', () => {
    expect(dedupeWords('card-card')).toBe('card');
    expect(dedupeWords('button-button-submit')).toBe('button-submit');
  });

  test('leaves non-adjacent duplicates', () => {
    expect(dedupeWords('card-bus-card')).toBe('card-bus-card');
  });
});

describe('toPascal — basic cases', () => {
  test('space-separated words', () => {
    expect(toPascal('how it works')).toBe('HowItWorks');
  });

  test('hyphenated', () => {
    expect(toPascal('red-deal')).toBe('RedDeal');
  });

  test('all-caps word', () => {
    expect(toPascal('CONTAINER')).toBe('Container');
  });

  test('slash paths are preserved', () => {
    expect(toPascal('icons/close')).toBe('Icons/Close');
  });

  test('camelCase input', () => {
    expect(toPascal('redDeal')).toBe('RedDeal');
  });

  test('already PascalCase is unchanged', () => {
    expect(toPascal('StudentDealCard')).toBe('StudentDealCard');
  });
});

describe('toPascal — acronyms', () => {
  test('cta → CTA', () => {
    expect(toPascal('cta')).toBe('CTA');
  });

  test('hero cta → HeroCTA', () => {
    expect(toPascal('hero cta')).toBe('HeroCTA');
  });

  test('faq section → FAQSection', () => {
    expect(toPascal('faq section')).toBe('FAQSection');
  });

  test('api-key-input → APIKeyInput', () => {
    expect(toPascal('api-key-input')).toBe('APIKeyInput');
  });

  test('non-acronym words are unaffected', () => {
    expect(toPascal('student deal card')).toBe('StudentDealCard');
  });

  // Acronym parity: plugin's KNOWN_ACRONYMS — these must be preserved, not Cta/Sdk
  test('PDP stays uppercase (plugin KNOWN_ACRONYMS)', () => {
    expect(toPascal('pdp')).toBe('PDP');
  });

  test('CMS stays uppercase', () => {
    expect(toPascal('cms')).toBe('CMS');
  });

  test('SDK stays uppercase', () => {
    expect(toPascal('sdk')).toBe('SDK');
  });
});

describe('isPascalCase', () => {
  test('valid PascalCase', () => {
    expect(isPascalCase('StudentDealCard')).toBe(true);
    expect(isPascalCase('Button')).toBe(true);
    expect(isPascalCase('A')).toBe(true);
  });

  test('slash path segments both PascalCase', () => {
    expect(isPascalCase('Card/Bus')).toBe(true);
    expect(isPascalCase('Icons/Close')).toBe(true);
  });

  test('not PascalCase', () => {
    expect(isPascalCase('hero-cta')).toBe(false);
    expect(isPascalCase('hero cta')).toBe(false);
    expect(isPascalCase('redDeal')).toBe(false);
    expect(isPascalCase('CONTAINER')).toBe(false);
    expect(isPascalCase('CTA')).toBe(false);
    expect(isPascalCase('How it works')).toBe(false);
  });

  test('empty string returns false', () => {
    expect(isPascalCase('')).toBe(false);
  });
});

describe('isNonStandardCase', () => {
  test('flagged as non-standard', () => {
    expect(isNonStandardCase('How it works')).toBe(true);
    expect(isNonStandardCase('redDeal')).toBe(true);
    expect(isNonStandardCase('hero-cta')).toBe(true);
    expect(isNonStandardCase('CONTAINER')).toBe(true);
  });

  test('valid PascalCase is not flagged', () => {
    expect(isNonStandardCase('StudentDealCard')).toBe(false);
    expect(isNonStandardCase('Button')).toBe(false);
    expect(isNonStandardCase('Card/Bus')).toBe(false);
  });

  test('too short or symbol-only are not flagged', () => {
    expect(isNonStandardCase('A')).toBe(false); // length < 2
    expect(isNonStandardCase('42')).toBe(false); // no letters
  });
});

describe('looksLikeData', () => {
  test('prices and numbers are data', () => {
    expect(looksLikeData('$42.00')).toBe(true);
    expect(looksLikeData('850')).toBe(true);
  });

  test('normal names are not data', () => {
    expect(looksLikeData('hero')).toBe(false);
    expect(looksLikeData('card')).toBe(false);
  });
});

describe('isPlaceholderText', () => {
  test('common placeholders', () => {
    expect(isPlaceholderText('Lorem ipsum dolor')).toBe(true);
    expect(isPlaceholderText('placeholder text')).toBe(true);
  });

  test('real content is not a placeholder', () => {
    expect(isPlaceholderText('Sign up for free')).toBe(false);
  });
});
