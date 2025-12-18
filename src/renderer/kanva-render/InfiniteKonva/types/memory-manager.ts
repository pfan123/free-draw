// types/memory-manager.ts
/**
 * 内存管理配置
 */
export interface MemoryManagerConfig {
  maxMemoryUsage: number; // 最大内存使用量（字节）
  warningThreshold: number; // 内存警告阈值（0-1）
  cleanupInterval: number; // 清理间隔（毫秒）
  objectPoolSize: number; // 对象池大小
  cacheStrategy: "lru" | "fifo" | "lfu"; // 缓存策略
  enableMonitoring: boolean; // 是否启用监控
  autoCleanup: boolean; // 是否自动清理
}

/**
 * 内存使用统计
 */
export interface MemoryUsage {
  total: number; // 总内存使用（字节）
  objects: number; // 对象内存
  cache: number; // 缓存内存
  layers: number; // 图层内存
  images: number; // 图片内存
  other: number; // 其他内存
}

/**
 * 缓存项
 */
export interface CacheItem {
  key: string;
  data: any;
  size: number; // 大小（字节）
  lastAccess: number; // 最后访问时间
  accessCount: number; // 访问次数
  priority: number; // 优先级（0-100）
}

/**
 * 内存监控数据
 */
export interface MemoryMetrics {
  currentUsage: MemoryUsage; // 当前使用情况
  peakUsage: number; // 峰值使用量
  cleanupCount: number; // 清理次数
  objectCount: number; // 对象总数
  cacheHitRate: number; // 缓存命中率
  leaksDetected: number; // 检测到的内存泄漏
}

/**
 * 内存清理选项
 */
export interface CleanupOptions {
  aggressive: boolean; // 激进清理
  preserveVisible: boolean; // 保留可见内容
  targetMemory: number; // 目标内存量
}
