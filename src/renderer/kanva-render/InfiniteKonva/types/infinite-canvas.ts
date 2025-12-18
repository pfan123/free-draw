// types/infinite-canvas.ts

import CanvasObject from "./canvas-object";

/**
 * 虚拟视口配置
 */
export interface VirtualViewportConfig {
  // 视口尺寸
  width: number;
  height: number;

  // 缩放范围
  minZoom: number;
  maxZoom: number;
  defaultZoom: number;

  // 性能优化
  chunkSize: number; // 分块大小
  preloadRadius: number; // 预加载半径（屏幕倍数）
  cacheSize: number; // 缓存分块数量

  // 渲染配置
  useLOD: boolean; // 是否使用细节级别
  lodThresholds: {
    low: number;
    medium: number;
    high: number;
  };

  // 背景配置
  showGrid: boolean;
  gridSize: number;
  gridColor: string;
}

/**
 * 分块数据
 */
export interface CanvasChunk {
  id: string; // 分块ID，格式："x_y"
  x: number; // 分块X坐标（世界单位）
  y: number; // 分块Y坐标（世界单位）
  width: number; // 分块宽度
  height: number; // 分块高度
  objects: CanvasObject[]; // 分块内的对象
  loaded: boolean; // 是否已加载
  rendering: boolean; // 是否正在渲染
  lastAccess: number; // 最后访问时间戳
}

/**
 * 视口状态
 */
export interface ViewportState {
  // 世界坐标系中的视口位置
  worldX: number;
  worldY: number;

  // 屏幕像素坐标
  screenX: number;
  screenY: number;

  // 缩放级别
  zoom: number;

  // 屏幕尺寸
  screenWidth: number;
  screenHeight: number;

  // 可见区域的世界坐标范围
  visibleBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

/**
 * 渲染统计
 */
export interface RenderingStats {
  totalChunks: number;
  loadedChunks: number;
  visibleChunks: number;
  totalObjects: number;
  visibleObjects: number;
  renderTime: number;
  fps: number;
  memoryUsage: number;
}
