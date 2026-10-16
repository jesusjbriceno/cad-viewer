/**
 * Neutral, format-independent drawing model. Every format loader produces a
 * `CadDocument`; the renderer only ever reads this model.
 *
 * Conventions:
 * - Coordinates are drawing units; `z` is kept when the source provides it but
 *   the 2D renderer ignores it.
 * - Angles are radians, counter-clockwise from the +X axis.
 * - Planar entities that DXF/DWG store in an Object Coordinate System (circle,
 *   arc, 2D polyline, text, insert, solid, hatch, dimension) keep their OCS
 *   coordinates exactly as stored and carry the OCS normal in `extrusion`;
 *   loaders omit `extrusion` when it is (0, 0, 1). The display list maps OCS to
 *   world coordinates with the arbitrary axis algorithm, once, for every format.
 *   Line, point, ellipse, spline, 3D polyline, leader, viewport and MTEXT
 *   coordinates are always world coordinates.
 */

export interface Point {
  x: number;
  y: number;
  z?: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Entity or layer color, kept symbolic so BYLAYER/BYBLOCK resolve at render time. */
export type Color =
  | { kind: "byLayer" }
  | { kind: "byBlock" }
  /** AutoCAD Color Index, 1..255. Index 7 is "white or black" depending on the background. */
  | { kind: "aci"; index: number }
  /** True color as 0xRRGGBB. */
  | { kind: "rgb"; value: number };

/** Line weight in hundredths of a millimetre, or one of the symbolic values. */
export type LineWeight = number | "byLayer" | "byBlock" | "default";

export interface CadLayer {
  name: string;
  /** Layer color; always `aci` or `rgb`. */
  color: Color;
  /** False when the layer is turned off. */
  visible: boolean;
  frozen: boolean;
  locked: boolean;
  lineType?: string;
  lineWeight?: LineWeight;
}

export interface CadLineType {
  name: string;
  description?: string;
  /** Dash pattern in drawing units: positive = dash, negative = gap, 0 = dot. Empty = continuous. */
  pattern: number[];
}

export interface CadTextStyle {
  name: string;
  /** Primary font file or family as stored in the drawing (e.g. "txt.shx", "Arial"). */
  font?: string;
  /** Fixed text height; 0 or undefined means "not fixed". */
  fixedHeight?: number;
  widthFactor?: number;
  /** Oblique angle in radians. */
  obliqueAngle?: number;
}

interface EntityBase {
  /** Source handle, when the format has one. */
  handle?: string;
  layer: string;
  color: Color;
  lineType?: string;
  lineTypeScale?: number;
  lineWeight?: LineWeight;
  /** False when the entity is flagged invisible. Defaults to true. */
  visible?: boolean;
  /** OCS normal; omitted when it is (0, 0, 1). */
  extrusion?: Vec3;
}

export interface LineEntity extends EntityBase {
  type: "line";
  start: Point;
  end: Point;
}

export interface CircleEntity extends EntityBase {
  type: "circle";
  center: Point;
  radius: number;
}

export interface ArcEntity extends EntityBase {
  type: "arc";
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface EllipseEntity extends EntityBase {
  type: "ellipse";
  center: Point;
  /** End point of the major axis, relative to `center`. */
  majorAxis: Point;
  /** Minor/major axis ratio, 0 < ratio <= 1. */
  ratio: number;
  /** Start and end parameters in radians; a full ellipse is 0..2π. */
  startParam: number;
  endParam: number;
}

export interface PolylineVertex extends Point {
  /** Tangent of a quarter of the arc angle to the next vertex; 0 = straight segment. */
  bulge?: number;
  startWidth?: number;
  endWidth?: number;
}

/** LWPOLYLINE, 2D POLYLINE and 3D POLYLINE all map to this entity. */
export interface PolylineEntity extends EntityBase {
  type: "polyline";
  vertices: PolylineVertex[];
  closed: boolean;
  /** Global width applied when vertices carry no widths. */
  constantWidth?: number;
}

export interface SplineEntity extends EntityBase {
  type: "spline";
  degree: number;
  controlPoints: Point[];
  knots: number[];
  /** One weight per control point for rational splines. */
  weights?: number[];
  fitPoints?: Point[];
  closed: boolean;
}

export interface PointEntity extends EntityBase {
  type: "point";
  position: Point;
}

export type TextHAlign = "left" | "center" | "right" | "aligned" | "middle" | "fit";
export type TextVAlign = "baseline" | "bottom" | "middle" | "top";

export interface TextEntity extends EntityBase {
  type: "text";
  /** First alignment point (insertion point). */
  position: Point;
  /** Second alignment point; used when alignment is not left/baseline. */
  alignPoint?: Point;
  height: number;
  rotation: number;
  /** Plain text with control codes (%%d, %%c, ...) already decoded. */
  value: string;
  hAlign: TextHAlign;
  vAlign: TextVAlign;
  widthFactor?: number;
  obliqueAngle?: number;
  style?: string;
}

/** MTEXT attachment point, 1 = top-left ... 9 = bottom-right. */
export type MTextAttachment = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface MTextEntity extends EntityBase {
  type: "mtext";
  position: Point;
  height: number;
  /** Reference rectangle width; 0 = no wrapping. */
  width: number;
  rotation: number;
  attachment: MTextAttachment;
  /** Raw MTEXT string including inline format codes (\P, \f, {...}). */
  value: string;
  lineSpacingFactor?: number;
  style?: string;
}

/** Block reference; ATTRIB values are kept as positioned texts. */
export interface InsertEntity extends EntityBase {
  type: "insert";
  blockName: string;
  position: Point;
  scale: Vec3;
  rotation: number;
  columnCount: number;
  rowCount: number;
  columnSpacing: number;
  rowSpacing: number;
  attributes: TextEntity[];
}

/** SOLID, TRACE and 3DFACE: a filled (or outlined, for 3DFACE) quadrilateral. */
export interface SolidEntity extends EntityBase {
  type: "solid";
  /** Three or four corners in DXF order (the 3rd and 4th are swapped vs. drawing order). */
  points: Point[];
  /** True for 3DFACE, which is drawn as an outline. */
  outlineOnly?: boolean;
}

export type HatchEdge =
  | { kind: "line"; start: Point; end: Point }
  | {
      kind: "arc";
      center: Point;
      radius: number;
      startAngle: number;
      endAngle: number;
      ccw: boolean;
    }
  | {
      kind: "ellipse";
      center: Point;
      majorAxis: Point;
      ratio: number;
      startAngle: number;
      endAngle: number;
      ccw: boolean;
    }
  | { kind: "spline"; degree: number; controlPoints: Point[]; knots: number[]; weights?: number[] };

export type HatchLoop =
  | { kind: "polyline"; vertices: PolylineVertex[]; closed: boolean }
  | { kind: "edges"; edges: HatchEdge[] };

export interface HatchPatternLine {
  /** Radians. */
  angle: number;
  origin: Point;
  /** Offset between successive parallel lines. */
  offset: Point;
  /** Dash pattern, same convention as `CadLineType.pattern`. */
  dashes: number[];
}

export interface HatchEntity extends EntityBase {
  type: "hatch";
  patternName: string;
  solid: boolean;
  loops: HatchLoop[];
  /** Pattern definition already scaled and rotated; empty for solid fills. */
  patternLines: HatchPatternLine[];
}

/** DIMENSION is rendered through its anonymous block (e.g. "*D12"). */
export interface DimensionEntity extends EntityBase {
  type: "dimension";
  blockName?: string;
  measurement?: number;
  /** Text override; "" or "<>" means the measured value. */
  text?: string;
}

export interface LeaderEntity extends EntityBase {
  type: "leader";
  vertices: Point[];
  hasArrowhead: boolean;
}

/** Paper-space viewport showing a window into model space. */
export interface ViewportEntity extends EntityBase {
  type: "viewport";
  /** Center and size of the viewport on paper. */
  center: Point;
  width: number;
  height: number;
  /** Model-space point shown at the viewport center. */
  viewCenter: Point;
  /** Model-space height shown inside the viewport. */
  viewHeight: number;
  /** Twist angle in radians. */
  twist?: number;
  /** Viewport id; id 1 is the paper-space overall viewport and is not drawn. */
  id?: number;
}

export interface RayEntity extends EntityBase {
  type: "ray" | "xline";
  basePoint: Point;
  direction: Point;
}

/** Anything a loader recognized but cannot represent; kept for statistics. */
export interface UnsupportedEntity extends EntityBase {
  type: "unsupported";
  sourceType: string;
}

export type CadEntity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | EllipseEntity
  | PolylineEntity
  | SplineEntity
  | PointEntity
  | TextEntity
  | MTextEntity
  | InsertEntity
  | SolidEntity
  | HatchEntity
  | DimensionEntity
  | LeaderEntity
  | ViewportEntity
  | RayEntity
  | UnsupportedEntity;

export type CadEntityType = CadEntity["type"];

export interface CadBlock {
  name: string;
  basePoint: Point;
  entities: CadEntity[];
  /** External reference path, when the block is an xref (not resolved by the viewer). */
  xrefPath?: string;
}

export interface CadLayout {
  name: string;
  isModel: boolean;
  /** Tab order; the model layout is 0. */
  tabOrder: number;
  entities: CadEntity[];
  /** Paper size limits for paper-space layouts, when known. */
  limits?: Bounds;
}

export interface CadHeader {
  /** Source version string, e.g. "AC1032". */
  version?: string;
  /** $INSUNITS value (0 = unitless, 4 = mm, 1 = inch, ...). */
  insUnits?: number;
  /** $EXTMIN/$EXTMAX of model space as saved; may be stale or missing. */
  extents?: Bounds;
  /** $PDMODE / $PDSIZE for POINT display. */
  pointDisplayMode?: number;
  pointDisplaySize?: number;
  /** $LTSCALE global line type scale. */
  lineTypeScale?: number;
}

export interface CadDocument {
  /** Loader id that produced the document ("dxf", "dwg", ...). */
  format: string;
  header: CadHeader;
  layers: Map<string, CadLayer>;
  lineTypes: Map<string, CadLineType>;
  textStyles: Map<string, CadTextStyle>;
  /** Block definitions by name, including anonymous blocks ("*D1", "*U2"). */
  blocks: Map<string, CadBlock>;
  /** Layouts in tab order; the first is always the model layout. */
  layouts: CadLayout[];
  /** Counts of source entity types the loader could not represent. */
  unsupported: Map<string, number>;
}
