// types/performance-optimizer.ts
/**
 * 渲染优化配置
 */
export interface PerformanceConfig {
  // 帧率控制
  targetFPS: number; // 目标帧率
  frameBudget: number; // 每帧时间预算（毫秒）

  // 批处理
  batchRendering: boolean; // 是否启用批处理
  batchSize: number; // 批处理大小
  batchDelay: number; // 批处理延迟（毫秒）

  // 节流
  throttleRendering: boolean; // 是否节流渲染
  throttleInterval: number; // 节流间隔（毫秒）

  // LOD设置
  lodEnabled: boolean; // 是否启用LOD
  lodLevels: Array<{
    // LOD级别配置
    zoomThreshold: number; // 缩放阈值
    simplifyFactor: number; // 简化因子
    opacity: number; // 不透明度
  }>;

  // 缓存
  enableCache: boolean; // 是否启用缓存
  cacheStrategy: "auto" | "manual"; // 缓存策略

  // 调试
  showStats: boolean; // 是否显示性能统计
  logPerformance: boolean; // 是否记录性能日志
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  fps: number; // 当前帧率
  frameTime: number; // 帧时间（毫秒）
  renderTime: number; // 渲染时间（毫秒）
  drawCalls: number; // 绘制调用次数
  triangles: number; // 三角形数量
  memoryUsage: number; // 内存使用量
  gpuMemory: number; // GPU内存使用量
}

/**
 * 渲染批次
 */
export interface RenderBatch {
  id: string;
  items: any[];
  priority: number;
  status: "pending" | "rendering" | "completed";
  startTime: number;
  endTime?: number;
}

/**
 * LOD状态
 */
export interface LODState {
  currentLevel: number;
  zoom: number;
  visibleObjects: number;
  simplifiedObjects: number;
  reductionRate: number; // 简化率
}
