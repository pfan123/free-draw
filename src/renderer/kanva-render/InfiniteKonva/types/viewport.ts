// src/types/viewport.ts
export interface Vector2D {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  // 世界坐标系中的视口位置（左上角）
  worldX: number;
  worldY: number;

  // 屏幕像素坐标（视口在Stage中的位置）- 视口在屏幕坐标系中的偏移（像素）
  screenX: number;
  screenY: number;

  // 缩放级别
  zoom: number;

  // 屏幕尺寸（像素）
  screenWidth: number;
  screenHeight: number;

  // 可见区域的世界坐标边界
  visibleBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface ViewportConfig {
  // 缩放范围
  minZoom: number;
  maxZoom: number;
  defaultZoom: number;

  // 缩放步长
  zoomStep: number;

  // 边界限制
  constraints: {
    enabled: boolean;
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
  };

  // 性能优化
  performance: {
    throttleViewportUpdates: boolean;
    throttleInterval: number; // 节流间隔（毫秒）
    debounceResize: number; // 防抖时间（毫秒）
  };
}

export interface ViewportEvent {
  type: "viewport-change" | "zoom-start" | "zoom-end" | "pan-start" | "pan-end";
  viewport: Viewport;
  delta?: {
    zoom?: number;
    panX?: number;
    panY?: number;
  };
  source?: "user" | "animation" | "programmatic";
}

export type ViewportEventHandler = (event: ViewportEvent) => void;

export interface ViewportStats {
  zoomLevel: number;
  viewportCenter: Vector2D;
  visibleArea: number;
  lastUpdateTime: number;
  updateCount: number;
  averageUpdateTime: number;
}
