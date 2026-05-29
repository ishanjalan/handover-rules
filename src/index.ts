export type { RuleNode, RulePaint, RuleEffect, RuleReaction, NodeKind, Issue, IssueType, NameReason } from './node.ts';
export * from './strings.ts';
export * from './name-rules.ts';
export * from './structure-rules.ts';
export { scanStructure, detectName, findDuplicateSiblings, getPath, countDescendants } from './scan.ts';
export type { NameDetection } from './scan.ts';
