// types/canvas-object.ts
/**
 * 二维向量/点坐标
 * 用于表示位置、大小、偏移等二维数据
 */
export interface Vector2D {
  x: number;
  y: number;
}

/**
 * 三维向量（用于扩展，如3D变换）
 */
export interface Vector3D extends Vector2D {
  z: number;
}

/**
 * 颜色类型
 * 支持颜色字符串、渐变对象、图案等
 */
export type ColorType =
  | string // 颜色字符串 '#RRGGBB', 'rgb()', 'rgba()'
  | CanvasGradient // Canvas渐变对象
  | CanvasPattern // Canvas图案对象
  | null // 透明/无颜色
  | undefined; // 未定义

/**
 * 线条端点样式
 */
export type LineCap = "butt" | "round" | "square";

/**
 * 线条连接样式
 */
export type LineJoin = "miter" | "round" | "bevel";

/**
 * 文本对齐方式
 */
export type TextAlign = "left" | "center" | "right" | "justify";

/**
 * 文本基线对齐方式
 */
export type TextBaseline =
  | "top"
  | "hanging"
  | "middle"
  | "alphabetic"
  | "ideographic"
  | "bottom";

/**
 * 字体样式
 */
export type FontStyle = "normal" | "italic" | "oblique";

/**
 * 字体粗细
 */
export type FontWeight =
  | "normal"
  | "bold"
  | "bolder"
  | "lighter"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900";

/**
 * 阴影配置
 */
export interface ShadowStyle {
  color: string;
  blur: number;
  offset: Vector2D;
  enabled: boolean;
}

/**
 * 边框样式
 */
export interface BorderStyle {
  color: string;
  width: number;
  style: "solid" | "dashed" | "dotted";
  radius?: number | number[]; // 圆角，支持统一值或四个角分别设置
}

/**
 * 渐变配置
 */
export interface GradientConfig {
  type: "linear" | "radial";
  start: Vector2D;
  end?: Vector2D; // 线性渐变需要
  center?: Vector2D; // 径向渐变需要
  radius?: number; // 径向渐变需要
  colorStops: Array<{
    offset: number; // 0-1
    color: string;
  }>;
}

/**
 * 图案配置
 */
export interface PatternConfig {
  image: HTMLImageElement | HTMLCanvasElement;
  repetition: "repeat" | "repeat-x" | "repeat-y" | "no-repeat";
  transform?: {
    scale?: Vector2D;
    rotation?: number;
    offset?: Vector2D;
  };
}

/**
 * 滤镜效果
 */
export interface FilterEffect {
  type:
    | "blur"
    | "brightness"
    | "contrast"
    | "grayscale"
    | "hue-rotate"
    | "invert"
    | "opacity"
    | "saturate"
    | "sepia";
  value: number | string;
}

/**
 * 对象类型枚举
 */
export enum ObjectTypeEnum {
  RECTANGLE = "rectangle",
  ELLIPSE = "ellipse",
  CIRCLE = "circle",
  LINE = "line",
  PATH = "path",
  POLYLINE = "polyline",
  POLYGON = "polygon",
  STAR = "star",
  TEXT = "text",
  IMAGE = "image",
  GROUP = "group",
  SVG_PATH = "svgPath",
  ARROW = "arrow",
  NOTE = "note",
  CONNECTOR = "connector",
  DIAGRAM = "diagram",
  TABLE = "table",
  CHART = "chart",
}

/**
 * 对象类型别名（兼容之前代码）
 */
export type ObjectType =
  | "rectangle"
  | "ellipse"
  | "circle"
  | "line"
  | "path"
  | "polyline"
  | "polygon"
  | "star"
  | "text"
  | "image"
  | "group"
  | "svgPath"
  | "arrow"
  | "note"
  | "connector"
  | "diagram"
  | "table"
  | "chart";

/**
 * 变换矩阵（2D）
 * 用于高级变换操作
 */
export interface TransformMatrix {
  a: number; // 水平缩放
  b: number; // 水平倾斜
  c: number; // 垂直倾斜
  d: number; // 垂直缩放
  e: number; // 水平平移
  f: number; // 垂直平移
}

/**
 * 对象动画配置
 */
export interface AnimationConfig {
  enabled: boolean;
  type: "entrance" | "exit" | "emphasis" | "path";
  duration: number; // 毫秒
  delay: number; // 毫秒
  easing: string; // 缓动函数
  repeat?: number; // 重复次数，0表示无限
  direction?: "normal" | "reverse" | "alternate";
  autoplay: boolean;
}

/**
 * 对象交互状态
 */
export interface InteractionState {
  hovered: boolean;
  selected: boolean;
  dragging: boolean;
  resizing: boolean;
  rotating: boolean;
  focused: boolean; // 用于文本输入等
}

/**
 * 对象事件处理器
 */
export interface EventHandlers {
  onClick?: (event: MouseEvent, object: CanvasObject) => void;
  onDoubleClick?: (event: MouseEvent, object: CanvasObject) => void;
  onMouseEnter?: (event: MouseEvent, object: CanvasObject) => void;
  onMouseLeave?: (event: MouseEvent, object: CanvasObject) => void;
  onMouseDown?: (event: MouseEvent, object: CanvasObject) => void;
  onMouseUp?: (event: MouseEvent, object: CanvasObject) => void;
  onMouseMove?: (event: MouseEvent, object: CanvasObject) => void;
  onDragStart?: (event: DragEvent, object: CanvasObject) => void;
  onDragMove?: (event: DragEvent, object: CanvasObject) => void;
  onDragEnd?: (event: DragEvent, object: CanvasObject) => void;
  onTransformStart?: (object: CanvasObject) => void;
  onTransform?: (object: CanvasObject) => void;
  onTransformEnd?: (object: CanvasObject) => void;
  onFocus?: (object: CanvasObject) => void;
  onBlur?: (object: CanvasObject) => void;
  onContextMenu?: (event: MouseEvent, object: CanvasObject) => void;
}

/**
 * 画布对象基础接口
 */
export interface CanvasObjectBase {
  // 唯一标识
  id: string;

  // 对象类型
  type: ObjectType;

  // 显示名称（可选）
  name?: string;

  // 描述信息（可选）
  description?: string;

  // 标签/分类
  tags?: string[];
}

/**
 * 画布对象几何属性接口
 */
export interface CanvasObjectGeometry {
  // 位置（左上角坐标）
  position: Vector2D;

  // 大小（宽高）
  size: Vector2D;

  // 旋转角度（度）
  rotation: number;

  // 缩放比例（相对于原始大小）
  scale: Vector2D;

  // 斜切/倾斜
  skew?: Vector2D;

  // 锚点/变换原点 (0-1，相对于对象自身)
  origin?: Vector2D;

  // 变换矩阵（高级功能）
  transformMatrix?: TransformMatrix;

  // 约束条件
  constraints?: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    aspectRatio?: number; // 宽高比，锁定用
    lockRotation?: boolean; // 锁定旋转
    lockScale?: boolean; // 锁定缩放
  };
}

/**
 * 画布对象样式接口
 */
export interface CanvasObjectStyle {
  // 填充
  fill?: ColorType | GradientConfig | PatternConfig;

  // 边框/描边
  stroke?: {
    color: ColorType;
    width: number;
    lineCap?: LineCap;
    lineJoin?: LineJoin;
    dash?: number[];
    dashOffset?: number;
    miterLimit?: number;
  };

  // 阴影
  shadow?: ShadowStyle;

  // 透明度 (0-1)
  opacity?: number;

  // 混合模式
  blendMode?: GlobalCompositeOperation;

  // 滤镜效果
  filters?: FilterEffect[];

  // 遮罩（其他对象ID或路径）
  mask?: string | number[];

  // 裁剪路径
  clipPath?: string | number[];

  // 可见性
  visible?: boolean;

  // 光标样式
  cursor?: string;
}

/**
 * 画布对象特定属性接口
 */
export interface CanvasObjectSpecificProperties {
  // 矩形
  cornerRadius?: number | number[];

  // 椭圆/圆
  radius?: number; // 圆形的半径
  radiusX?: number; // 椭圆水平半径
  radiusY?: number; // 椭圆垂直半径

  // 线条/路径
  points?: number[]; // 点数组 [x1, y1, x2, y2, ...]
  tension?: number; // 曲线张力
  closed?: boolean; // 是否闭合
  arrow?: {
    start?: boolean; // 起始箭头
    end?: boolean; // 结束箭头
    size?: number; // 箭头大小
    type?: "triangle" | "circle" | "diamond"; // 箭头类型
  };

  // 路径数据（SVG格式）
  pathData?: string;

  // 文本
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: FontStyle;
  fontWeight?: FontWeight;
  textAlign?: TextAlign;
  verticalAlign?: TextBaseline;
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: {
    underline?: boolean;
    overline?: boolean;
    lineThrough?: boolean;
  };
  textShadow?: ShadowStyle;
  maxWidth?: number; // 文本最大宽度，超出自动换行

  // 图片
  imageUrl?: string;
  imageElement?: HTMLImageElement;
  imageSmoothing?: boolean;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // 多边形/星形
  sides?: number; // 边数
  innerRadius?: number; // 星形内半径
  outerRadius?: number; // 星形外半径

  // 箭头
  arrowLength?: number;
  arrowAngle?: number; // 箭头角度

  // 连接线
  connector?: {
    start: string; // 起始对象ID
    end: string; // 结束对象ID
    startAnchor?: string; // 起始锚点
    endAnchor?: string; // 结束锚点
    routing?: "straight" | "orthogonal" | "curved"; // 路由方式
  };

  // 表格
  table?: {
    rows: number;
    columns: number;
    cells: Array<{
      row: number;
      col: number;
      content?: string;
      rowSpan?: number;
      colSpan?: number;
      style?: Partial<CanvasObjectStyle>;
    }>;
    headerRows?: number;
    headerColumns?: number;
  };

  // 图表
  chart?: {
    type: "bar" | "line" | "pie" | "scatter";
    data: any[];
    options: any;
  };
}

/**
 * 画布对象层级与分组接口
 */
export interface CanvasObjectHierarchy {
  // Z轴顺序（渲染顺序）
  zIndex: number;

  // 父对象ID（用于分组）
  parentId?: string;

  // 子对象ID数组
  childrenIds?: string[];

  // 图层ID（用于图层管理）
  layerId?: string;

  // 是否锁定（禁止交互）
  locked?: boolean;

  // 是否可选中
  selectable?: boolean;

  // 是否可拖拽
  draggable?: boolean;

  // 是否可调整大小
  resizable?: boolean;

  // 是否可旋转
  rotatable?: boolean;

  // 是否可编辑（如文本）
  editable?: boolean;
}

/**
 * 画布对象元数据接口
 */
export interface CanvasObjectMetadata {
  // 创建时间戳
  createdAt: number;

  // 最后修改时间戳
  updatedAt: number;

  // 创建者ID/名称
  createdBy: string;

  // 最后修改者ID/名称
  updatedBy?: string;

  // 数据版本号（用于乐观锁和同步）
  version: number;

  // 来源信息（导入、复制等）
  source?: {
    type: "import" | "copy" | "template" | "plugin";
    id?: string;
    name?: string;
  };

  // 自定义属性（扩展用）
  custom?: Record<string, any>;

  // 状态标记
  flags?: {
    selected?: boolean;
    highlighted?: boolean;
    hidden?: boolean; // 临时隐藏
    deleted?: boolean; // 软删除标记
    temporary?: boolean; // 临时对象
  };

  // 动画配置
  animation?: AnimationConfig;

  // 交互状态（运行时）
  interaction?: InteractionState;

  // 事件处理器
  events?: EventHandlers;

  // 数据绑定（用于动态内容）
  dataBinding?: {
    source: string; // 数据源ID
    field: string; // 字段名
    format?: string; // 格式化模板
    updateOn?: "always" | "change"; // 更新时机
  };

  visible?: boolean;
  locked?: boolean;
}

/**
 * 完整的画布对象接口
 */
export interface CanvasObject
  extends CanvasObjectBase,
    CanvasObjectGeometry,
    CanvasObjectHierarchy {
  style?: CanvasObjectStyle;
  // 类型特定属性
  properties: CanvasObjectSpecificProperties;

  // 元数据
  metadata: CanvasObjectMetadata;
}

/**
 * 画布对象更新数据（用于部分更新）
 */
export type CanvasObjectUpdate = Partial<CanvasObject> & {
  id: string;
  metadata: {
    updatedAt: number;
    version: number;
    updatedBy?: string;
  };
};

/**
 * 画布对象创建数据（用于新建对象）
 */
export type CanvasObjectCreate = Omit<
  CanvasObject,
  "id" | "metadata" | "createdAt" | "updatedAt" | "version"
> & {
  id?: string; // 可选，不提供则自动生成
  metadata?: Partial<CanvasObjectMetadata>;
};

/**
 * 对象选择器（用于查找和过滤）
 */
export interface ObjectSelector {
  ids?: string[];
  type?: ObjectType | ObjectType[];
  tags?: string[];
  layerId?: string;
  parentId?: string | null; // null表示顶层对象
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  query?: (obj: CanvasObject) => boolean;
}

/**
 * 渲染配置
 */
export interface RenderConfig {
  // 性能相关
  useCache: boolean; // 是否使用节点缓存
  batchDraw: boolean; // 是否批量绘制
  simplifyOnZoomOut: boolean; // 缩放时是否简化渲染
  virtualRendering?: boolean; // 是否只渲染可见区域

  // LOD配置
  lodThresholds: {
    low: number; // zoom < 此值时使用低细节
    medium: number; // zoom < 此值时使用中等细节
    high: number; // zoom >= 此值时使用高细节
  };

  // 缓存配置
  cacheConfig?: {
    maxCacheSize: number; // 最大缓存数量
    clearUnusedInterval: number; // 清理未使用缓存的间隔（毫秒）
    cacheByZoomLevel: boolean; // 是否按缩放级别分别缓存
  };

  // 动画配置
  animationConfig?: {
    enabled: boolean; // 是否启用动画
    duration: number; // 默认动画时长（毫秒）
    easing: string; // 默认缓动函数
    fpsLimit: number; // 动画帧率限制
  };

  // 调试配置
  debug?: {
    showBounds: boolean; // 显示对象边界框
    showPerformance: boolean; // 显示性能信息
    showCacheStats: boolean; // 显示缓存统计
    highlightRenderArea: boolean; // 高亮渲染区域
  };
}

/**
 * 渲染统计信息
 */
export interface RenderStats {
  totalObjects: number;
  visibleObjects: number;
  cachedNodes: number;
  cachedImages: number;
  lastRenderTime: number;
  averageRenderTime: number;
  memoryUsage?: number;
}

/**
 * 边界框（用于碰撞检测、可见性判断等）
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;

  // 扩展属性（计算得出）
  minX?: number;
  minY?: number;
  maxX?: number;
  maxY?: number;
  center?: Vector2D;
}

/**
 * 转换选项
 */
export interface TransformOptions {
  // 是否保持比例
  keepProportion: boolean;

  // 变换中心点
  transformOrigin: Vector2D;

  // 约束条件
  constraints?: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    aspectRatio?: number;
  };

  // 是否立即应用
  immediate: boolean;

  // 是否记录历史
  recordHistory: boolean;
}

/**
 * 导出选项
 */
export interface ExportOptions {
  format: "png" | "jpeg" | "svg" | "json";
  quality?: number; // 0-1，仅对图片格式有效
  scale?: number; // 缩放比例
  bounds?: BoundingBox; // 导出的区域
  backgroundColor?: string;
  includeHidden?: boolean; // 是否包含隐藏对象
  includeGrid?: boolean; // 是否包含网格
}

export default CanvasObject;
