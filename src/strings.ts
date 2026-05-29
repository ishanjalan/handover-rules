// String helpers and naming regexes — single source of truth for both consumers.
// All functions are pure (no Figma API calls).

// Matches Figma's default auto-generated names: "Frame 1", "Group 23", etc.
export const GENERIC_NAME_RE =
  /^(Frame|Group|Rectangle|Ellipse|Vector|Polygon|Star|Line|Image|Component|Instance)\s+\d+$/i;

// Non-ASCII localized equivalents — catches French "Cadre 5", German "Rahmen 3", Korean/Chinese defaults.
export const LOCALIZED_GENERIC_RE = /^[À-ɏ一-鿿가-힯]+\s+\d+$/;

// Clearly throwaway / placeholder names (not semantic names designers would keep).
// Deliberately excludes structural words like card/item/wrapper that Handover itself proposes.
export const LOW_INFO_RE =
  /^(temp|tmp|test|new|old|copy|duplicate|backup|untitled|layer|xxx|asdf|delete|remove|el|div)(\s+\d+)?$/i;

// Figma's auto-copy habit: "Artboard copy 12", "Frame copy 05". Two+ digits = clearly accidental.
export const COPY_SUFFIX_RE = /copy\s+\d{2,}$/i;

// Placeholder/filler text we should never use as a layer name.
export const PLACEHOLDER_RE =
  /^(lorem(\s+ipsum)?|ipsum|placeholder|text|heading|title|untitled|tbd|todo|asdf|test|temp|sample|copy|body)\b/i;

// Acronyms that should stay fully upper-cased in PascalCase output (CTA, not Cta).
// Deliberately small + unambiguous — over-listing risks mis-casing real words.
// Matching is whole-segment only so embedded letters are never affected.
export const KNOWN_ACRONYMS = new Set([
  'CTA', 'FAQ', 'URL', 'API', 'UI', 'UX', 'ID', 'SEO', 'CMS', 'PDP', 'PLP', 'KPI',
  'IOS', 'SDK', 'QR', 'OTP', 'SSO',
]);

// Normalize any string to dev-friendly kebab-case, ≤32 chars.
export function toKebab(s: string): string {
  return s
    // Strip emoji and control chars before splitting
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
    .replace(/[​‌‍﻿]/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, ' ')
    .replace(/[☀-⟿]/g, ' ')
    // camelCase / PascalCase → spaced
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    // Drop articles
    .replace(/^(the|a|an)\s+/i, '')
    // Anything non-word becomes a separator
    .replace(/[^\w]+/g, '-')
    // Collapse repeated separators
    .replace(/-+/g, '-')
    // Trim leading/trailing separators
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 32);
}

// Standard handover convention: PascalCase, slash-paths preserved (Figma variant style).
export function toPascal(s: string): string {
  return s
    .split('/')
    .map((seg) => {
      const k = toKebab(seg);
      return k
        .split('-')
        .filter(Boolean)
        .map((w) => {
          const upper = w.toUpperCase();
          if (KNOWN_ACRONYMS.has(upper)) return upper;
          return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join('');
    })
    .filter(Boolean)
    .join('/')
    .slice(0, 48);
}

export function isPascalCase(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  // After the leading uppercase, the next char (if any) must be lowercase/digit
  // to distinguish PascalCase (Button, StudentCard) from all-caps (CONTAINER, CTA).
  return t.split('/').every((seg) => /^[A-Z]([a-z0-9][A-Za-z0-9]*)?$/.test(seg.trim()));
}

// Meaningful name that violates PascalCase (lowercase start, spaces, hyphens, underscores).
export function isNonStandardCase(name: string): boolean {
  const t = name.trim();
  if (t.length < 2) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  return !isPascalCase(t);
}

export function sanitizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function isPlaceholderText(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}

// Reject text that is data/content — using it as a layer name produces noise
// like "21-00-06-16", "ac-sleeper-8h-15m", "save-up-to-242", "850".
export function looksLikeData(text: string): boolean {
  const t = text.trim();

  // High digit ratio: >40% of chars are digits in a 5+ char string
  if (t.length >= 5) {
    const digits = (t.match(/\d/g) ?? []).length;
    if (digits / t.length > 0.4) return true;
  }

  // Standalone number (optionally with commas/decimal)
  if (/^[\d,]+(\.\d+)?$/.test(t)) return true;

  // Price: any currency symbol near digits
  if (/[$€£₹₩¥]/.test(t) && /\d/.test(t)) return true;

  // Time: HH:MM or HH:MM AM/PM
  if (/\b\d{1,2}:\d{2}(\s*[ap]m)?\b/i.test(t)) return true;

  // Date-like: several numbers joined only by dashes/slashes/dots, e.g. "21-00-06-16"
  if (/^\d[\d\-\/\.]+\d$/.test(t) && (t.match(/\d/g) ?? []).length >= 4) return true;

  // Duration: 8h15m, 8h 15m, 45min, "8h 15m journey"
  if (/\d+\s*(h|hr|hrs|hour|hours|m(?!o)|min|mins|minute|minutes)\b/i.test(t)) return true;

  // Percentage
  if (/\d+(\.\d+)?\s*%/.test(t)) return true;

  // Promo / urgency openers — dynamic copy, not structural roles
  if (/^(only\s|save\s|from\s|up\s+to\s|just\s|hurry|last\s+\d|limited\s|exclusive\s|offer\s|deal\s|flat\s+\d|get\s+\d|earn\s+\d|free\b)/i.test(t)) return true;

  return false;
}

// Collapse repeated adjacent words ("card card" → "card", "button button-submit" → "button-submit").
export function dedupeWords(kebab: string): string {
  const parts = kebab.split('-');
  const out: string[] = [];
  for (const part of parts) {
    if (out[out.length - 1] !== part) out.push(part);
  }
  return out.join('-');
}
