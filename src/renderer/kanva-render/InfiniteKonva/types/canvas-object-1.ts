// types/canvas-object.ts - 类型声明文件
export type ObjectType =
  | "rectangle"
  | "ellipse"
  | "circle"
  | "line"
  | "path"
  | "text"
  | "image"
  | "group"
  | "polygon"
  | "star";

/**
 * 二维向量/点坐标
 * 用于表示位置、大小、偏移等二维数据
 */
export interface Vector2D {
  x: number;
  y: number;
}

export interface CanvasObject {
  id: string;
  type: ObjectType;

  // 位置和变换
  position: Vector2D;
  size: Vector2D;
  rotation: number;
  scale: Vector2D;

  // 样式属性
  style: {
    fill?: string | CanvasGradient;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffset?: Vector2D;
    dash?: number[];
    lineCap?: "butt" | "round" | "square";
    lineJoin?: "miter" | "round" | "bevel";
  };

  // 类型特定属性
  properties: {
    // 矩形
    cornerRadius?: number | number[];

    // 椭圆
    radiusX?: number;
    radiusY?: number;

    // 圆
    radius?: number;

    // 线条/路径
    points?: number[];
    tension?: number;
    closed?: boolean;

    // 文本
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontStyle?: "normal" | "bold" | "italic";
    align?: "left" | "center" | "right";

    // 图片
    imageUrl?: string;
    imageElement?: HTMLImageElement;

    // 多边形/星形
    sides?: number;
    innerRadius?: number;
  };

  // 层级和分组
  zIndex: number;
  parentId?: string;
  childrenIds?: string[];

  // 元数据
  metadata: {
    createdAt: number;
    updatedAt: number;
    createdBy: string;
    version: number;
    visible: boolean;
    locked: boolean;
  };
}

// 渲染配置
export interface RenderConfig {
  useCache: boolean; // 是否使用缓存
  batchDraw: boolean; // 是否批量绘制
  simplifyOnZoomOut: boolean; // 缩放时是否简化
  lodThresholds: {
    // 细节级别阈值
    low: number; // zoom < 0.3
    medium: number; // zoom < 0.8
    high: number; // zoom >= 0.8
  };
}
