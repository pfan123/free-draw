// performance/MemoryManager.ts
/**
 * 内存管理器 MemoryManager - 管理无限画布的内存使用，防止内存泄漏和过度消耗
 * 内存管理：LRU缓存、对象池、内存泄漏检测
 */
import {
  MemoryManagerConfig,
  MemoryUsage,
  CacheItem,
  MemoryMetrics,
  CleanupOptions,
} from "../types/memory-manager";

export class MemoryManager {
  // 配置
  private config: MemoryManagerConfig;

  // 缓存管理
  private cache: Map<string, CacheItem> = new Map();
  private objectPool: Map<string, any[]> = new Map();

  // 内存监控
  private metrics: MemoryMetrics;
  private cleanupTimer: number | null = null;
  private monitoringInterval: number | null = null;

  // 引用跟踪（用于检测内存泄漏）
  private objectReferences: WeakMap<object, string> = new WeakMap();
  private referenceCount: Map<string, number> = new Map();

  constructor(config?: Partial<MemoryManagerConfig>) {
    this.config = {
      maxMemoryUsage: 500 * 1024 * 1024, // 500MB
      warningThreshold: 0.8, // 80%阈值
      cleanupInterval: 30000, // 30秒清理一次
      objectPoolSize: 1000,
      cacheStrategy: "lru",
      enableMonitoring: true,
      autoCleanup: true,
      ...config,
    };

    // 初始化指标
    this.metrics = {
      currentUsage: {
        total: 0,
        objects: 0,
        cache: 0,
        layers: 0,
        images: 0,
        other: 0,
      },
      peakUsage: 0,
      cleanupCount: 0,
      objectCount: 0,
      cacheHitRate: 0,
      leaksDetected: 0,
    };

    // 启动监控和自动清理
    if (this.config.enableMonitoring) {
      this.startMonitoring();
    }

    if (this.config.autoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * 缓存对象
   */
  cacheObject(
    key: string,
    data: any,
    size?: number,
    priority: number = 50
  ): void {
    const estimatedSize = size || this.estimateObjectSize(data);

    const cacheItem: CacheItem = {
      key,
      data,
      size: estimatedSize,
      lastAccess: Date.now(),
      accessCount: 1,
      priority,
    };

    this.cache.set(key, cacheItem);

    // 更新内存统计
    this.updateMemoryUsage();

    // 检查是否需要清理
    if (this.shouldCleanup()) {
      this.performCleanup();
    }
  }

  /**
   * 获取缓存对象
   */
  getCachedObject(key: string): any | null {
    const cacheItem = this.cache.get(key);

    if (cacheItem) {
      // 更新访问信息
      cacheItem.lastAccess = Date.now();
      cacheItem.accessCount++;

      // 更新缓存命中率
      this.updateCacheHitRate(true);

      return cacheItem.data;
    }

    // 未命中
    this.updateCacheHitRate(false);
    return null;
  }

  /**
   * 更新缓存命中率
   */
  private updateCacheHitRate(hit: boolean): void {
    // 简化实现：使用滑动窗口
    const totalRequests = this.metrics.cacheHitRate * 100 || 0;
    const newRequests = totalRequests + 1;
    const newHits =
      (this.metrics.cacheHitRate * totalRequests || 0) + (hit ? 1 : 0);

    this.metrics.cacheHitRate = newHits / newRequests;
  }

  /**
   * 从对象池获取对象
   */
  acquireFromPool(type: string): any | null {
    const pool = this.objectPool.get(type);

    if (pool && pool.length > 0) {
      const obj = pool.pop()!;
      this.trackObject(obj, type);
      return obj;
    }

    return null;
  }

  /**
   * 释放对象到对象池
   */
  releaseToPool(type: string, obj: any): void {
    let pool = this.objectPool.get(type);

    if (!pool) {
      pool = [];
      this.objectPool.set(type, pool);
    }

    // 检查池大小
    if (pool.length < this.config.objectPoolSize) {
      // 重置对象状态
      this.resetObject(obj);
      pool.push(obj);

      // 停止跟踪（对象已回收）
      this.untrackObject(obj);
    } else {
      // 池已满，直接释放
      this.disposeObject(obj);
    }
  }

  /**
   * 注册对象进行内存跟踪
   */
  registerObject(obj: any, type: string): void {
    this.trackObject(obj, type);
  }

  /**
   * 注销对象
   */
  unregisterObject(obj: any): void {
    this.untrackObject(obj);
  }

  /**
   * 跟踪对象
   */
  private trackObject(obj: object, type: string): void {
    // 生成唯一标识
    const id = `${type}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // 使用WeakMap跟踪（不会阻止垃圾回收）
    this.objectReferences.set(obj, id);

    // 更新引用计数
    const count = this.referenceCount.get(id) || 0;
    this.referenceCount.set(id, count + 1);

    // 更新对象计数
    this.metrics.objectCount++;
  }

  /**
   * 停止跟踪对象
   */
  private untrackObject(obj: object): void {
    const id = this.objectReferences.get(obj);
    if (id) {
      const count = (this.referenceCount.get(id) || 1) - 1;

      if (count <= 0) {
        this.referenceCount.delete(id);
      } else {
        this.referenceCount.set(id, count);
      }

      // 更新对象计数
      this.metrics.objectCount = Math.max(0, this.metrics.objectCount - 1);
    }
  }

  /**
   * 检查内存泄漏
   */
  private checkForLeaks(): void {
    // 检查引用计数异常的对象
    let leaks = 0;

    this.referenceCount.forEach((count, id) => {
      if (count > 100) {
        // 异常高的引用计数可能表示泄漏
        console.warn(
          `Possible memory leak detected: ${id} has ${count} references`
        );
        leaks++;
      }
    });

    this.metrics.leaksDetected += leaks;

    return leaks;
  }

  /**
   * 估计对象大小
   */
  private estimateObjectSize(obj: any): number {
    if (obj === null || obj === undefined) {
      return 0;
    }

    const type = typeof obj;

    if (type === "boolean") {
      return 4; // 布尔值在V8中占用4字节
    } else if (type === "number") {
      return 8; // 数字占用8字节
    } else if (type === "string") {
      // 字符串：每个字符2字节 + 头部开销
      return obj.length * 2 + 12;
    } else if (type === "object") {
      if (Array.isArray(obj)) {
        // 数组：元素大小总和 + 数组开销
        return obj.reduce(
          (sum, item) => sum + this.estimateObjectSize(item),
          12
        );
      } else {
        // 对象：属性大小总和 + 对象开销
        let size = 12; // 基础对象开销
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            size += key.length * 2 + this.estimateObjectSize(obj[key]) + 8;
          }
        }
        return size;
      }
    }

    return 8; // 默认估计
  }

  /**
   * 更新内存使用统计
   */
  private updateMemoryUsage(): void {
    // 计算缓存内存
    let cacheMemory = 0;
    this.cache.forEach((item) => {
      cacheMemory += item.size;
    });

    // 计算对象池内存
    let poolMemory = 0;
    this.objectPool.forEach((pool) => {
      pool.forEach((obj) => {
        poolMemory += this.estimateObjectSize(obj);
      });
    });

    // 更新统计
    this.metrics.currentUsage = {
      total: cacheMemory + poolMemory,
      cache: cacheMemory,
      objects: poolMemory,
      layers: 0, // 这些需要从外部获取
      images: 0,
      other: 0,
    };

    // 更新峰值
    this.metrics.peakUsage = Math.max(
      this.metrics.peakUsage,
      this.metrics.currentUsage.total
    );
  }

  /**
   * 检查是否需要清理
   */
  private shouldCleanup(): boolean {
    const usage = this.metrics.currentUsage.total;
    const max = this.config.maxMemoryUsage;
    const threshold = this.config.warningThreshold;

    return usage > max * threshold;
  }

  /**
   * 执行内存清理
   */
  performCleanup(options?: CleanupOptions): void {
    const opts: CleanupOptions = {
      aggressive: false,
      preserveVisible: true,
      targetMemory: this.config.maxMemoryUsage * 0.6, // 清理到60%
      ...options,
    };

    const startMemory = this.metrics.currentUsage.total;
    let cleanedMemory = 0;

    // 根据策略清理缓存
    switch (this.config.cacheStrategy) {
      case "lru":
        cleanedMemory += this.cleanupLRUCache(opts);
        break;
      case "fifo":
        cleanedMemory += this.cleanupFIFOCache(opts);
        break;
      case "lfu":
        cleanedMemory += this.cleanupLFUCache(opts);
        break;
    }

    // 清理对象池
    if (opts.aggressive) {
      cleanedMemory += this.cleanupObjectPool();
    }

    // 强制垃圾回收（如果可用）
    this.triggerGarbageCollection();

    // 更新统计
    this.metrics.cleanupCount++;
    this.updateMemoryUsage();

    // 检查内存泄漏
    this.checkForLeaks();

    console.log(
      `Memory cleanup completed: ${(cleanedMemory / 1024 / 1024).toFixed(
        2
      )}MB freed`
    );

    return cleanedMemory;
  }

  /**
   * LRU缓存清理策略
   */
  private cleanupLRUCache(options: CleanupOptions): number {
    let cleanedMemory = 0;
    const targetMemory = options.targetMemory;

    // 获取所有缓存项并按最后访问时间排序
    const cacheItems = Array.from(this.cache.values()).sort(
      (a, b) => a.lastAccess - b.lastAccess
    ); // 升序，最早的在前

    // 清理直到达到目标内存
    let currentMemory = this.metrics.currentUsage.total;

    for (const item of cacheItems) {
      if (currentMemory - cleanedMemory <= targetMemory) {
        break;
      }

      // 检查是否可以清理（根据优先级）
      if (item.priority < 30 || !options.preserveVisible) {
        this.cache.delete(item.key);
        cleanedMemory += item.size;
      }
    }

    return cleanedMemory;
  }

  /**
   * FIFO缓存清理策略
   */
  private cleanupFIFOCache(options: CleanupOptions): number {
    // 与LRU类似，但基于创建时间而不是最后访问时间
    // 简化实现：使用LRU逻辑
    return this.cleanupLRUCache(options);
  }

  /**
   * LFU缓存清理策略
   */
  private cleanupLFUCache(options: CleanupOptions): number {
    let cleanedMemory = 0;
    const targetMemory = options.targetMemory;

    // 获取所有缓存项并按访问次数排序
    const cacheItems = Array.from(this.cache.values()).sort(
      (a, b) => a.accessCount - b.accessCount
    ); // 升序，访问次数少的在前

    // 清理直到达到目标内存
    let currentMemory = this.metrics.currentUsage.total;

    for (const item of cacheItems) {
      if (currentMemory - cleanedMemory <= targetMemory) {
        break;
      }

      if (item.priority < 30 || !options.preserveVisible) {
        this.cache.delete(item.key);
        cleanedMemory += item.size;
      }
    }

    return cleanedMemory;
  }

  /**
   * 清理对象池
   */
  private cleanupObjectPool(): number {
    let cleanedMemory = 0;

    this.objectPool.forEach((pool, type) => {
      // 清理一半的对象
      const itemsToRemove = Math.floor(pool.length / 2);

      for (let i = 0; i < itemsToRemove; i++) {
        const obj = pool.pop();
        if (obj) {
          cleanedMemory += this.estimateObjectSize(obj);
          this.disposeObject(obj);
        }
      }
    });

    return cleanedMemory;
  }

  /**
   * 重置对象状态（用于对象池）
   */
  private resetObject(obj: any): void {
    // 根据对象类型重置
    if (obj && typeof obj === "object") {
      if (obj instanceof Konva.Node) {
        // 重置Konva节点
        obj.remove();
        obj.visible(true);
        obj.opacity(1);
        obj.rotation(0);
        obj.scale({ x: 1, y: 1 });
      }
      // 可以添加其他类型的重置逻辑
    }
  }

  /**
   * 销毁对象
   */
  private disposeObject(obj: any): void {
    if (obj && typeof obj === "object") {
      if (obj instanceof Konva.Node) {
        obj.destroy();
      } else if (obj.dispose && typeof obj.dispose === "function") {
        obj.dispose();
      }
      // 可以添加其他类型的销毁逻辑
    }
  }

  /**
   * 触发垃圾回收
   */
  private triggerGarbageCollection(): void {
    if (window.gc && typeof window.gc === "function") {
      // Chrome开发者工具中的强制GC（仅开发模式）
      try {
        window.gc();
      } catch (e) {
        // 忽略错误
      }
    }
  }

  /**
   * 开始内存监控
   */
  private startMonitoring(): void {
    this.monitoringInterval = window.setInterval(() => {
      this.updateMemoryUsage();

      // 输出监控信息（可选）
      if (console && console.debug) {
        console.debug("[MemoryManager]", this.getMetrics());
      }
    }, 10000); // 每10秒监控一次
  }

  /**
   * 开始自动清理
   */
  private startAutoCleanup(): void {
    this.cleanupTimer = window.setInterval(() => {
      if (this.shouldCleanup()) {
        this.performCleanup();
      }
    }, this.config.cleanupInterval);
  }

  /**
   * 获取内存指标
   */
  getMetrics(): MemoryMetrics {
    return { ...this.metrics };
  }

  /**
   * 获取当前内存使用情况
   */
  getCurrentUsage(): MemoryUsage {
    return { ...this.metrics.currentUsage };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MemoryManagerConfig>): void {
    this.config = { ...this.config, ...config };

    // 重启定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.config.autoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * 清理所有资源
   */
  clearAll(): void {
    // 清空缓存
    this.cache.clear();

    // 清空对象池
    this.objectPool.forEach((pool) => {
      pool.forEach((obj) => this.disposeObject(obj));
    });
    this.objectPool.clear();

    // 更新统计
    this.updateMemoryUsage();
  }

  /**
   * 销毁内存管理器
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.clearAll();

    // 清空引用
    this.objectReferences = new WeakMap();
    this.referenceCount.clear();
  }
}
