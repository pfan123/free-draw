// performance/PerformanceOptimizer.ts
/**
 * 性能优化器 PerformanceOptimizer
 * 渲染优化：批处理、LOD、节流、缓存
 */
import Konva from "konva";
import {
  PerformanceConfig,
  PerformanceMetrics,
  RenderBatch,
  LODState,
} from "../types/performance-optimizer";

export class PerformanceOptimizer {
  private config: PerformanceConfig;
  private metrics: PerformanceMetrics;
  private stage: Konva.Stage;

  // 渲染控制
  private renderQueue: RenderBatch[] = [];
  private isRendering: boolean = false;
  private lastRenderTime: number = 0;
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;

  // LOD管理
  private lodState: LODState;
  private objectLODCache: Map<string, any> = new Map();

  // 性能监控
  private statsDisplay: StatsDisplay | null = null;
  private monitoringEnabled: boolean = true;

  constructor(stage: Konva.Stage, config?: Partial<PerformanceConfig>) {
    this.stage = stage;

    // 默认配置
    this.config = {
      targetFPS: 60,
      frameBudget: 16, // 60fps对应的帧时间
      batchRendering: true,
      batchSize: 50,
      batchDelay: 0,
      throttleRendering: true,
      throttleInterval: 16,
      lodEnabled: true,
      lodLevels: [
        { zoomThreshold: 0.1, simplifyFactor: 0.1, opacity: 0.5 },
        { zoomThreshold: 0.3, simplifyFactor: 0.3, opacity: 0.7 },
        { zoomThreshold: 0.6, simplifyFactor: 0.6, opacity: 0.9 },
        { zoomThreshold: 1.0, simplifyFactor: 1.0, opacity: 1.0 },
      ],
      enableCache: true,
      cacheStrategy: "auto",
      showStats: false,
      logPerformance: false,
      ...config,
    };

    // 初始化指标
    this.metrics = {
      fps: 60,
      frameTime: 0,
      renderTime: 0,
      drawCalls: 0,
      triangles: 0,
      memoryUsage: 0,
      gpuMemory: 0,
    };

    // 初始化LOD状态
    this.lodState = {
      currentLevel: 3,
      zoom: 1,
      visibleObjects: 0,
      simplifiedObjects: 0,
      reductionRate: 0,
    };

    // 初始化性能监控
    this.initializePerformanceMonitoring();

    // 启动渲染循环
    this.startRenderLoop();
  }

  /**
   * 初始化性能监控
   */
  private initializePerformanceMonitoring(): void {
    // 启动FPS监控
    this.startFPSMonitoring();

    // 如果启用了性能统计显示，创建统计面板
    if (this.config.showStats) {
      this.statsDisplay = new StatsDisplay();
      document.body.appendChild(this.statsDisplay.dom);
    }

    // 启动性能日志记录
    if (this.config.logPerformance) {
      this.startPerformanceLogging();
    }
  }

  /**
   * 启动渲染循环
   */
  private startRenderLoop(): void {
    const renderLoop = () => {
      const frameStart = performance.now();

      // 处理渲染队列
      this.processRenderQueue();

      // 更新性能指标
      this.updatePerformanceMetrics(frameStart);

      // 更新统计显示
      if (this.statsDisplay) {
        this.statsDisplay.update(this.metrics);
      }

      // 继续下一帧
      requestAnimationFrame(renderLoop);
    };

    requestAnimationFrame(renderLoop);
  }

  /**
   * 添加渲染任务到队列
   */
  scheduleRender(task: any, priority: number = 50): string {
    if (!this.config.batchRendering) {
      // 立即渲染
      this.renderImmediate(task);
      return "immediate";
    }

    // 查找现有批次
    let batch = this.renderQueue.find(
      (b) => b.status === "pending" && b.items.length < this.config.batchSize
    );

    if (!batch) {
      // 创建新批次
      batch = {
        id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        items: [],
        priority,
        status: "pending",
        startTime: Date.now(),
      };
      this.renderQueue.push(batch);
    }

    // 添加到批次
    batch.items.push(task);
    batch.priority = Math.max(batch.priority, priority);

    // 如果批次已满或延迟时间到，立即处理
    if (
      batch.items.length >= this.config.batchSize ||
      (this.config.batchDelay === 0 && !this.isRendering)
    ) {
      this.processBatch(batch);
    }

    return batch.id;
  }

  /**
   * 立即渲染
   */
  private renderImmediate(task: any): void {
    const renderStart = performance.now();

    try {
      // 执行渲染任务
      if (typeof task === "function") {
        task();
      } else {
        // 处理渲染对象
        this.renderObject(task);
      }

      // 更新渲染时间
      this.metrics.renderTime = performance.now() - renderStart;
    } catch (error) {
      console.error("Render error:", error);
    }
  }

  /**
   * 处理渲染批次
   */
  private processBatch(batch: RenderBatch): void {
    if (batch.status !== "pending" || this.isRendering) {
      return;
    }

    // 检查是否应该节流
    if (this.config.throttleRendering) {
      const now = performance.now();
      if (now - this.lastRenderTime < this.config.throttleInterval) {
        return;
      }
    }

    batch.status = "rendering";
    this.isRendering = true;

    // 使用setTimeout确保不阻塞主线程
    setTimeout(() => {
      const renderStart = performance.now();

      try {
        // 批量渲染
        this.renderBatch(batch.items);
        batch.status = "completed";
        batch.endTime = performance.now();

        // 更新指标
        this.metrics.renderTime = batch.endTime - renderStart;
        this.metrics.drawCalls += Math.ceil(batch.items.length / 10); // 估计
      } catch (error) {
        console.error("Batch render error:", error);
        batch.status = "pending"; // 重试
      } finally {
        this.isRendering = false;
        this.lastRenderTime = performance.now();

        // 从队列中移除已完成的批次
        this.renderQueue = this.renderQueue.filter(
          (b) => b.status !== "completed"
        );
      }
    }, 0);
  }

  /**
   * 处理渲染队列
   */
  private processRenderQueue(): void {
    if (this.isRendering || this.renderQueue.length === 0) {
      return;
    }

    // 按优先级排序
    this.renderQueue.sort((a, b) => b.priority - a.priority);

    // 处理最高优先级的批次
    const nextBatch = this.renderQueue.find((b) => b.status === "pending");
    if (nextBatch) {
      this.processBatch(nextBatch);
    }
  }

  /**
   * 批量渲染对象
   */
  private renderBatch(items: any[]): void {
    items.forEach((item) => {
      this.renderObject(item);
    });

    // 批量绘制
    this.stage.batchDraw();
  }

  /**
   * 渲染单个对象
   */
  private renderObject(obj: any): void {
    // 这里应该调用具体的渲染逻辑
    // 简化实现
    if (obj && typeof obj.draw === "function") {
      obj.draw();
    }
  }

  /**
   * 应用LOD优化
   */
  applyLODOptimization(zoom: number, objects: any[]): any[] {
    if (!this.config.lodEnabled) {
      return objects;
    }

    // 更新LOD状态
    this.lodState.zoom = zoom;
    this.lodState.visibleObjects = objects.length;

    // 确定当前LOD级别
    const lodLevel = this.getLODLevelForZoom(zoom);
    this.lodState.currentLevel = lodLevel;

    if (lodLevel < this.config.lodLevels.length - 1) {
      // 需要应用简化
      const levelConfig = this.config.lodLevels[lodLevel];
      const simplifiedObjects = this.simplifyObjects(
        objects,
        levelConfig.simplifyFactor
      );

      this.lodState.simplifiedObjects = simplifiedObjects.length;
      this.lodState.reductionRate =
        (objects.length - simplifiedObjects.length) / objects.length;

      return simplifiedObjects;
    }

    // 最高LOD级别，不简化
    this.lodState.simplifiedObjects = 0;
    this.lodState.reductionRate = 0;

    return objects;
  }

  /**
   * 根据缩放级别获取LOD级别
   */
  private getLODLevelForZoom(zoom: number): number {
    for (let i = 0; i < this.config.lodLevels.length; i++) {
      if (zoom >= this.config.lodLevels[i].zoomThreshold) {
        return i;
      }
    }
    return this.config.lodLevels.length - 1;
  }

  /**
   * 简化对象（LOD优化）
   */
  private simplifyObjects(objects: any[], simplifyFactor: number): any[] {
    if (simplifyFactor >= 1) {
      return objects;
    }

    // 根据简化因子选择要显示的对象
    const targetCount = Math.max(
      1,
      Math.floor(objects.length * simplifyFactor)
    );

    // 简化策略：根据距离、重要性等选择对象
    // 这里简化实现：随机选择
    const simplified = objects
      .sort(() => Math.random() - 0.5)
      .slice(0, targetCount);

    // 应用不透明度
    const opacity =
      this.config.lodLevels[this.getLODLevelForZoom(this.lodState.zoom)]
        .opacity;
    simplified.forEach((obj) => {
      if (obj.opacity) {
        obj.opacity = opacity;
      }
    });

    return simplified;
  }

  /**
   * 缓存对象渲染结果
   */
  cacheObjectRender(key: string, object: any): void {
    if (!this.config.enableCache) {
      return;
    }

    // 创建缓存项
    const cacheItem = {
      key,
      object,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now(),
    };

    this.objectLODCache.set(key, cacheItem);

    // 自动缓存管理
    if (this.config.cacheStrategy === "auto") {
      this.manageCache();
    }
  }

  /**
   * 从缓存获取对象
   */
  getCachedObjectRender(key: string): any | null {
    const cacheItem = this.objectLODCache.get(key);

    if (cacheItem) {
      cacheItem.accessCount++;
      cacheItem.lastAccess = Date.now();
      return cacheItem.object;
    }

    return null;
  }

  /**
   * 缓存管理
   */
  private manageCache(): void {
    const maxCacheSize = 1000;

    if (this.objectLODCache.size > maxCacheSize) {
      // LRU缓存清理
      const cacheItems = Array.from(this.objectLODCache.entries())
        .map(([key, item]) => ({ key, ...item }))
        .sort((a, b) => a.lastAccess - b.lastAccess); // 按最后访问时间排序

      // 清理一半的缓存
      const itemsToRemove = cacheItems.slice(
        0,
        Math.floor(cacheItems.length / 2)
      );

      itemsToRemove.forEach((item) => {
        this.objectLODCache.delete(item.key);
      });
    }
  }

  /**
   * 启动FPS监控
   */
  private startFPSMonitoring(): void {
    const updateFPS = () => {
      const now = performance.now();
      this.frameCount++;

      if (now >= this.lastFpsUpdate + 1000) {
        this.metrics.fps = Math.round(
          (this.frameCount * 1000) / (now - this.lastFpsUpdate)
        );
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }

      requestAnimationFrame(updateFPS);
    };

    requestAnimationFrame(updateFPS);
  }

  /**
   * 启动性能日志记录
   */
  private startPerformanceLogging(): void {
    setInterval(() => {
      if (this.metrics.fps < 30) {
        console.warn("[Performance Warning] Low FPS:", this.metrics.fps);
      }

      if (this.metrics.renderTime > this.config.frameBudget) {
        console.warn(
          "[Performance Warning] High render time:",
          this.metrics.renderTime
        );
      }

      // 记录详细性能数据
      if (this.config.logPerformance) {
        this.logPerformanceData();
      }
    }, 10000); // 每10秒检查一次
  }

  /**
   * 记录性能数据
   */
  private logPerformanceData(): void {
    const data = {
      timestamp: new Date().toISOString(),
      ...this.metrics,
      lodState: { ...this.lodState },
      queueLength: this.renderQueue.length,
      cacheSize: this.objectLODCache.size,
    };

    // 这里可以将数据发送到服务器或存储到IndexedDB
    console.debug("[Performance Log]", data);
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(frameStart: number): void {
    const frameEnd = performance.now();
    this.metrics.frameTime = frameEnd - frameStart;

    // 更新内存使用（如果可用）
    if (performance.memory) {
      this.metrics.memoryUsage = performance.memory.usedJSHeapSize;
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * 获取LOD状态
   */
  getLODState(): LODState {
    return { ...this.lodState };
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; hitRate: number } {
    // 这里应该计算缓存命中率
    return {
      size: this.objectLODCache.size,
      hitRate: 0, // 简化实现
    };
  }

  /**
   * 强制重新渲染
   */
  forceRender(): void {
    this.stage.batchDraw();
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.objectLODCache.clear();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };

    // 更新统计显示
    if (this.config.showStats && !this.statsDisplay) {
      this.statsDisplay = new StatsDisplay();
      document.body.appendChild(this.statsDisplay.dom);
    } else if (!this.config.showStats && this.statsDisplay) {
      document.body.removeChild(this.statsDisplay.dom);
      this.statsDisplay = null;
    }
  }

  /**
   * 销毁优化器
   */
  destroy(): void {
    this.clearCache();
    this.renderQueue = [];

    if (this.statsDisplay) {
      document.body.removeChild(this.statsDisplay.dom);
      this.statsDisplay = null;
    }
  }
}

/**
 * 性能统计显示面板
 */
class StatsDisplay {
  public dom: HTMLDivElement;
  private fpsElement: HTMLElement;
  private frameTimeElement: HTMLElement;
  private memoryElement: HTMLElement;
  private objectsElement: HTMLElement;
  private lodElement: HTMLElement;

  constructor() {
    this.dom = document.createElement("div");
    this.dom.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      padding: 10px;
      border-radius: 5px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      min-width: 200px;
    `;

    this.fpsElement = this.createStatElement("FPS");
    this.frameTimeElement = this.createStatElement("Frame Time");
    this.memoryElement = this.createStatElement("Memory");
    this.objectsElement = this.createStatElement("Objects");
    this.lodElement = this.createStatElement("LOD");

    this.dom.appendChild(this.fpsElement);
    this.dom.appendChild(this.frameTimeElement);
    this.dom.appendChild(this.memoryElement);
    this.dom.appendChild(this.objectsElement);
    this.dom.appendChild(this.lodElement);
  }

  private createStatElement(label: string): HTMLElement {
    const element = document.createElement("div");
    element.innerHTML = `${label}: <span class="value">--</span>`;
    return element;
  }

  update(metrics: PerformanceMetrics): void {
    this.fpsElement.querySelector(".value")!.textContent =
      metrics.fps.toString();
    this.frameTimeElement.querySelector(".value")!.textContent =
      metrics.frameTime.toFixed(2) + "ms";

    if (metrics.memoryUsage > 0) {
      const memoryMB = (metrics.memoryUsage / 1024 / 1024).toFixed(2);
      this.memoryElement.querySelector(".value")!.textContent = memoryMB + "MB";
    }
  }

  updateLOD(lodState: LODState): void {
    this.lodElement.querySelector(".value")!.textContent = `Level ${
      lodState.currentLevel
    } (${(lodState.reductionRate * 100).toFixed(1)}% reduced)`;
    this.objectsElement.querySelector(
      ".value"
    )!.textContent = `${lodState.visibleObjects} visible, ${lodState.simplifiedObjects} simplified`;
  }
}
