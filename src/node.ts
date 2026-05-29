export type NodeKind =
  | 'FRAME' | 'GROUP' | 'COMPONENT' | 'COMPONENT_SET' | 'INSTANCE' | 'SECTION'
  | 'TEXT' | 'VECTOR' | 'LINE' | 'STAR' | 'POLYGON' | 'ELLIPSE' | 'RECTANGLE'
  | 'BOOLEAN_OPERATION' | 'PAGE' | 'DOCUMENT' | string;

export interface RulePaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  gradientStops?: Array<{ color: { a: number } }>;
}

export interface RuleEffect {
  type: string;
  visible?: boolean;
}

export interface RuleReaction {
  trigger?: { type?: string } | null;
  action?: { type?: string; transition?: { type?: string } | null } | null;
}

export interface RuleNode {
  id: string;
  name: string;
  type: NodeKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode?: string;

  // local geometry (relative to parent); NaN-safe
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;

  // layout
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID' | string;
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL' | string;
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL' | string;
  layoutPositioning?: 'AUTO' | 'ABSOLUTE' | string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  constraints?: { horizontal: string; vertical: string };
  overflowDirection?: string;
  clipsContent: boolean;

  // visual identity
  fills: RulePaint[];
  strokes: RulePaint[];
  strokeWeight?: number;
  effects: RuleEffect[];
  cornerRadius?: number;   // number only; "mixed" → undefined
  isMask?: boolean;

  // signals
  reactions: RuleReaction[];
  exportSettings: unknown[];
  annotations: unknown[];
  componentPropertyReferences?: Record<string, string>;
  mainComponentId?: string | null;  // INSTANCE only; null/undefined ⇒ detached

  // content
  characters?: string;             // TEXT only
  vectorVertexCount?: number;      // VECTOR only; undefined on REST (skip rule)

  // relationships (adapters wire these)
  parent: RuleNode | null;
  children: RuleNode[];
}

export type IssueType =
  | 'empty-container'
  | 'hidden-layer'
  | 'transparent-fill'
  | 'zero-size'
  | 'out-of-bounds'
  | 'empty-text'
  | 'single-child-group'
  | 'group-in-autolayout'
  | 'passthrough-frame'
  | 'wrapper-frame'
  | 'redundant-frame'
  | 'empty-vector'
  | 'detached-instance';

export type NameReason =
  | 'default'
  | 'low-info'
  | 'copy-suffix'
  | 'short'
  | 'duplicate-sibling'
  | 'non-standard-case'
  | 'smart-animate-match';

export interface Issue {
  id: string;
  type: IssueType;
  name: string;
  nodeType: string;
  path: string;
  layersFreed: number;
}
