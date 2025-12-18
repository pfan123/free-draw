// types/chunked-canvas.ts
import Konva from "konva";

/**
 * 分块配置
 */
export interface ChunkConfig {
  chunkSize: number; // 分块大小（世界单位）
  preloadRadius: number; // 预加载半径（分块数）
  cacheSize: number; // 缓存分块数量
  maxConcurrentLoads: number; // 最大并发加载数
  loadPriority: "center" | "closest"; // 加载优先级策略
}

/**
 * 分块状态
 */
export enum ChunkStatus {
  UNLOADED = "unloaded", // 未加载
  LOADING = "loading", // 加载中
  LOADED = "loaded", // 已加载
  RENDERING = "rendering", // 渲染中
  RENDERED = "rendered", // 已渲染
  UNLOADING = "unloading", // 卸载中
}

/**
 * 分块元数据
 */
export interface ChunkMetadata {
  id: string; // 分块ID，格式："x_y"
  x: number; // 分块X坐标（世界单位）
  y: number; // 分块Y坐标（世界单位）
  status: ChunkStatus; // 当前状态
  objectCount: number; // 对象数量
  lastAccessTime: number; // 最后访问时间
  loadTime: number; // 加载耗时
  renderTime: number; // 渲染耗时
  memoryUsage: number; // 内存使用量
  layer?: Konva.Layer; // 对应的Konva层
  dataPromise?: Promise<any>; // 数据加载Promise
}

/**
 * 渲染优先级
 */
export interface RenderPriority {
  priority: number; // 优先级（0-100）
  reason: "visible" | "preload" | "center" | "user"; // 优先级原因
  distance: number; // 到视口中心的距离
}

/**
 * 分块加载策略
 */
export interface LoadStrategy {
  // 可见区域加载
  loadVisible: boolean; // 是否加载可见分块
  visiblePriority: number; // 可见分块优先级

  // 预加载
  preloadEnabled: boolean; // 是否启用预加载
  preloadRadius: number; // 预加载半径
  preloadPriority: number; // 预加载优先级

  // 懒加载
  lazyLoad: boolean; // 是否懒加载
  lazyThreshold: number; // 懒加载阈值（毫秒）

  // 错误处理
  retryOnFail: boolean; // 失败是否重试
  maxRetries: number; // 最大重试次数
}

/**
 * 分块统计信息
 */
export interface ChunkStats {
  totalChunks: number; // 总分块数
  loadedChunks: number; // 已加载分块数
  renderingChunks: number; // 正在渲染分块数
  cachedChunks: number; // 缓存分块数
  unloadedChunks: number; // 未加载分块数
  totalObjects: number; // 总对象数
  loadedObjects: number; // 已加载对象数
  averageLoadTime: number; // 平均加载时间
  averageRenderTime: number; // 平均渲染时间
  memoryUsage: number; // 总内存使用
}
