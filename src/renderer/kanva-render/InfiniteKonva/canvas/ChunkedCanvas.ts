// canvas/ChunkedCanvas.ts
/**
 * 分块画布系统 ChunkedCanvas
 * 分块渲染：将无限空间划分为可管理的分块，按需加载
 */
import Konva from "konva";
import {
  ChunkConfig,
  ChunkStatus,
  ChunkMetadata,
  RenderPriority,
  LoadStrategy,
  ChunkStats,
} from "../types/chunked-canvas";
import { ViewportState } from "../types/infinite-canvas";
import { CanvasObject } from "../types/canvas-object";

export class ChunkedCanvas {
  // 核心组件
  private stage: Konva.Stage;
  private chunkContainer: Konva.Group;

  // 配置管理
  private config: ChunkConfig;
  private loadStrategy: LoadStrategy;

  // 分块管理
  private chunks: Map<string, ChunkMetadata> = new Map();
  private chunkLayers: Map<string, Konva.Layer> = new Map();
  private chunkDataCache: Map<string, CanvasObject[]> = new Map();

  // 加载队列
  private loadQueue: Array<{ chunkId: string; priority: RenderPriority }> = [];
  private isProcessingQueue: boolean = false;
  private activeLoads: Set<string> = new Set();

  // 渲染队列
  private renderQueue: Array<{ chunkId: string; priority: RenderPriority }> =
    [];
  private isRendering: boolean = false;
  private frameBudget: number = 5; // 每帧最多渲染的分块数

  // 性能统计
  private stats: ChunkStats;
  private performanceMonitor: PerformanceMonitor;

  // 事件监听
  private eventListeners: Map<string, Function[]> = new Map();

  constructor(stage: Konva.Stage, config?: Partial<ChunkConfig>) {
    this.stage = stage;

    // 默认配置
    this.config = {
      chunkSize: 2000,
      preloadRadius: 2,
      cacheSize: 100,
      maxConcurrentLoads: 3,
      loadPriority: "center",
      ...config,
    };

    // 默认加载策略
    this.loadStrategy = {
      loadVisible: true,
      visiblePriority: 100,
      preloadEnabled: true,
      preloadRadius: this.config.preloadRadius,
      preloadPriority: 50,
      lazyLoad: true,
      lazyThreshold: 100,
      retryOnFail: true,
      maxRetries: 3,
    };

    // 创建分块容器
    this.chunkContainer = new Konva.Group();
    const baseLayer = new Konva.Layer();
    baseLayer.add(this.chunkContainer);
    this.stage.add(baseLayer);

    // 初始化统计信息
    this.stats = {
      totalChunks: 0,
      loadedChunks: 0,
      renderingChunks: 0,
      cachedChunks: 0,
      unloadedChunks: 0,
      totalObjects: 0,
      loadedObjects: 0,
      averageLoadTime: 0,
      averageRenderTime: 0,
      memoryUsage: 0,
    };

    // 初始化性能监控
    this.performanceMonitor = new PerformanceMonitor();

    // 启动队列处理器
    this.startQueueProcessing();
  }

  /**
   * 更新视口，重新计算需要加载的分块
   */
  updateViewport(viewport: ViewportState): void {
    const visibleChunkIds = this.getVisibleChunkIds(viewport);
    const preloadChunkIds = this.getPreloadChunkIds(viewport, visibleChunkIds);

    // 所有需要处理的分块
    const allChunkIds = [...visibleChunkIds, ...preloadChunkIds];
    const existingChunkIds = Array.from(this.chunks.keys());

    // 需要卸载的分块（不再需要）
    const chunksToUnload = existingChunkIds.filter(
      (id) => !allChunkIds.includes(id)
    );

    // 需要加载的新分块
    const chunksToLoad = allChunkIds.filter(
      (id) => !existingChunkIds.includes(id) && !this.activeLoads.has(id)
    );

    // 卸载不再需要的分块
    this.unloadChunks(chunksToUnload);

    // 计算分块优先级并加入加载队列
    chunksToLoad.forEach((chunkId) => {
      const priority = this.calculateChunkPriority(chunkId, viewport);
      this.addToLoadQueue(chunkId, priority);
    });

    // 更新已加载分块的优先级（用于缓存管理）
    this.updateChunkPriorities(viewport);

    // 处理加载和渲染队列
    this.processQueues();

    // 触发视口更新事件
    this.emit("viewport-updated", {
      viewport,
      visibleChunks: visibleChunkIds.length,
      preloadChunks: preloadChunkIds.length,
      loadedChunks: this.stats.loadedChunks,
    });
  }

  /**
   * 获取可见区域的分块ID
   */
  private getVisibleChunkIds(viewport: ViewportState): string[] {
    const bounds = viewport.visibleBounds;
    const chunkSize = this.config.chunkSize;

    const startX = Math.floor(bounds.minX / chunkSize);
    const startY = Math.floor(bounds.minY / chunkSize);
    const endX = Math.ceil(bounds.maxX / chunkSize);
    const endY = Math.ceil(bounds.maxY / chunkSize);

    const chunkIds: string[] = [];

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        chunkIds.push(`${x}_${y}`);
      }
    }

    return chunkIds;
  }

  /**
   * 获取预加载区域的分块ID
   */
  private getPreloadChunkIds(
    viewport: ViewportState,
    visibleChunkIds: string[]
  ): string[] {
    if (!this.loadStrategy.preloadEnabled) {
      return [];
    }

    const bounds = viewport.visibleBounds;
    const chunkSize = this.config.chunkSize;
    const radius = this.loadStrategy.preloadRadius;

    const startX = Math.floor((bounds.minX - radius * chunkSize) / chunkSize);
    const startY = Math.floor((bounds.minY - radius * chunkSize) / chunkSize);
    const endX = Math.ceil((bounds.maxX + radius * chunkSize) / chunkSize);
    const endY = Math.ceil((bounds.maxY + radius * chunkSize) / chunkSize);

    const chunkIds: string[] = [];

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const chunkId = `${x}_${y}`;
        if (!visibleChunkIds.includes(chunkId)) {
          chunkIds.push(chunkId);
        }
      }
    }

    return chunkIds;
  }

  /**
   * 计算分块优先级
   */
  private calculateChunkPriority(
    chunkId: string,
    viewport: ViewportState
  ): RenderPriority {
    const [chunkX, chunkY] = chunkId.split("_").map(Number);
    const chunkCenter = {
      x: (chunkX + 0.5) * this.config.chunkSize,
      y: (chunkY + 0.5) * this.config.chunkSize,
    };

    const viewportCenter = {
      x: (viewport.visibleBounds.minX + viewport.visibleBounds.maxX) / 2,
      y: (viewport.visibleBounds.minY + viewport.visibleBounds.maxY) / 2,
    };

    // 计算距离
    const distance = Math.sqrt(
      Math.pow(chunkCenter.x - viewportCenter.x, 2) +
        Math.pow(chunkCenter.y - viewportCenter.y, 2)
    );

    // 判断是否在可见区域
    const isVisible = this.getVisibleChunkIds(viewport).includes(chunkId);

    // 判断是否在预加载区域
    const isPreload =
      !isVisible && this.getPreloadChunkIds(viewport, []).includes(chunkId);

    // 计算优先级
    let priority: number;
    let reason: RenderPriority["reason"];

    if (isVisible) {
      priority = this.loadStrategy.visiblePriority;
      reason = "visible";
    } else if (isPreload) {
      priority = this.loadStrategy.preloadPriority;
      reason = "preload";

      // 根据距离调整优先级（越近优先级越高）
      const maxDistance =
        this.config.chunkSize * this.loadStrategy.preloadRadius;
      priority *= 1 - distance / maxDistance;
    } else {
      priority = 0;
      reason = "user";
    }

    // 根据加载策略调整优先级
    if (this.config.loadPriority === "center") {
      priority *= 1 - distance / (this.config.chunkSize * 10);
    }

    return {
      priority: Math.max(0, Math.min(100, priority)),
      reason,
      distance,
    };
  }

  /**
   * 添加分块到加载队列
   */
  private addToLoadQueue(chunkId: string, priority: RenderPriority): void {
    // 检查是否已在队列中
    const existingIndex = this.loadQueue.findIndex(
      (item) => item.chunkId === chunkId
    );

    if (existingIndex >= 0) {
      // 更新现有条目的优先级
      if (priority.priority > this.loadQueue[existingIndex].priority.priority) {
        this.loadQueue[existingIndex].priority = priority;
        // 重新排序队列
        this.sortLoadQueue();
      }
    } else {
      // 添加到队列
      this.loadQueue.push({ chunkId, priority });
      this.sortLoadQueue();

      // 创建分块元数据
      const [x, y] = chunkId.split("_").map(Number);
      const chunk: ChunkMetadata = {
        id: chunkId,
        x: x * this.config.chunkSize,
        y: y * this.config.chunkSize,
        status: ChunkStatus.UNLOADED,
        objectCount: 0,
        lastAccessTime: Date.now(),
        loadTime: 0,
        renderTime: 0,
        memoryUsage: 0,
      };

      this.chunks.set(chunkId, chunk);
      this.stats.totalChunks++;
      this.stats.unloadedChunks++;
    }
  }

  /**
   * 排序加载队列（按优先级降序）
   */
  private sortLoadQueue(): void {
    this.loadQueue.sort((a, b) => b.priority.priority - a.priority.priority);
  }

  /**
   * 启动队列处理
   */
  private startQueueProcessing(): void {
    const processQueues = () => {
      this.processLoadQueue();
      this.processRenderQueue();
      requestAnimationFrame(processQueues);
    };

    requestAnimationFrame(processQueues);
  }

  /**
   * 处理加载队列
   */
  private processLoadQueue(): void {
    if (
      this.activeLoads.size >= this.config.maxConcurrentLoads ||
      this.loadQueue.length === 0
    ) {
      return;
    }

    // 获取最高优先级的待加载分块
    const nextChunks = this.loadQueue.splice(
      0,
      this.config.maxConcurrentLoads - this.activeLoads.size
    );

    nextChunks.forEach(({ chunkId, priority }) => {
      this.loadChunk(chunkId, priority);
    });
  }

  /**
   * 加载分块数据
   */
  private async loadChunk(
    chunkId: string,
    priority: RenderPriority
  ): Promise<void> {
    // 标记为加载中
    const chunk = this.chunks.get(chunkId)!;
    chunk.status = ChunkStatus.LOADING;
    this.activeLoads.add(chunkId);

    this.stats.unloadedChunks--;
    this.stats.loadedChunks++;

    // 检查是否有缓存数据
    if (this.chunkDataCache.has(chunkId)) {
      const cachedData = this.chunkDataCache.get(chunkId)!;
      await this.onChunkDataLoaded(chunkId, cachedData);
      return;
    }

    try {
      const loadStartTime = performance.now();

      // 异步加载分块数据
      const chunkData = await this.fetchChunkData(chunkId);

      chunk.loadTime = performance.now() - loadStartTime;
      this.stats.averageLoadTime =
        (this.stats.averageLoadTime * (this.stats.loadedChunks - 1) +
          chunk.loadTime) /
        this.stats.loadedChunks;

      // 缓存数据
      this.chunkDataCache.set(chunkId, chunkData);

      // 处理加载完成
      await this.onChunkDataLoaded(chunkId, chunkData);
    } catch (error) {
      console.error(`Failed to load chunk ${chunkId}:`, error);

      // 错误处理：重试或标记为失败
      if (
        this.loadStrategy.retryOnFail &&
        (chunk as any).retryCount < this.loadStrategy.maxRetries
      ) {
        (chunk as any).retryCount = ((chunk as any).retryCount || 0) + 1;
        this.addToLoadQueue(chunkId, priority);
      } else {
        chunk.status = ChunkStatus.UNLOADED;
        this.stats.loadedChunks--;
        this.stats.unloadedChunks++;
      }
    } finally {
      this.activeLoads.delete(chunkId);
    }
  }

  /**
   * 分块数据加载完成处理
   */
  private async onChunkDataLoaded(
    chunkId: string,
    data: CanvasObject[]
  ): Promise<void> {
    const chunk = this.chunks.get(chunkId)!;
    chunk.status = ChunkStatus.LOADED;
    chunk.objectCount = data.length;
    chunk.lastAccessTime = Date.now();

    // 更新统计信息
    this.stats.totalObjects += data.length;
    this.stats.loadedObjects += data.length;

    // 添加到渲染队列
    const priority = this.calculateCurrentPriority(chunkId);
    this.addToRenderQueue(chunkId, priority);

    // 触发事件
    this.emit("chunk-loaded", {
      chunkId,
      objectCount: data.length,
      loadTime: chunk.loadTime,
    });
  }

  /**
   * 添加分块到渲染队列
   */
  private addToRenderQueue(chunkId: string, priority: RenderPriority): void {
    // 检查是否已在队列中
    const existingIndex = this.renderQueue.findIndex(
      (item) => item.chunkId === chunkId
    );

    if (existingIndex >= 0) {
      // 更新优先级
      if (
        priority.priority > this.renderQueue[existingIndex].priority.priority
      ) {
        this.renderQueue[existingIndex].priority = priority;
        this.sortRenderQueue();
      }
    } else {
      // 添加到队列
      this.renderQueue.push({ chunkId, priority });
      this.sortRenderQueue();
    }
  }

  /**
   * 排序渲染队列
   */
  private sortRenderQueue(): void {
    this.renderQueue.sort((a, b) => b.priority.priority - a.priority.priority);
  }

  /**
   * 处理渲染队列
   */
  private processRenderQueue(): void {
    if (this.isRendering || this.renderQueue.length === 0) {
      return;
    }

    // 每帧限制渲染的分块数量
    const chunksToRender = this.renderQueue.splice(0, this.frameBudget);

    if (chunksToRender.length > 0) {
      this.isRendering = true;

      // 使用setTimeout确保渲染不阻塞主线程
      setTimeout(() => {
        this.renderChunks(chunksToRender);
        this.isRendering = false;
      }, 0);
    }
  }

  /**
   * 渲染分块
   */
  private renderChunks(
    chunks: Array<{ chunkId: string; priority: RenderPriority }>
  ): void {
    const renderStartTime = performance.now();

    chunks.forEach(({ chunkId, priority }) => {
      const chunk = this.chunks.get(chunkId)!;

      if (chunk.status === ChunkStatus.LOADED) {
        chunk.status = ChunkStatus.RENDERING;
        this.stats.renderingChunks++;

        try {
          // 创建分块层并渲染
          this.renderChunkLayer(chunkId);

          chunk.status = ChunkStatus.RENDERED;
          chunk.renderTime = performance.now() - renderStartTime;

          // 更新平均渲染时间
          this.stats.averageRenderTime =
            (this.stats.averageRenderTime * (this.stats.loadedChunks - 1) +
              chunk.renderTime) /
            this.stats.loadedChunks;

          // 触发事件
          this.emit("chunk-rendered", {
            chunkId,
            renderTime: chunk.renderTime,
            priority: priority.priority,
          });
        } catch (error) {
          console.error(`Failed to render chunk ${chunkId}:`, error);
          chunk.status = ChunkStatus.LOADED;
        } finally {
          this.stats.renderingChunks--;
        }
      }
    });

    // 更新内存使用统计
    this.updateMemoryStats();
  }

  /**
   * 渲染分块层
   */
  private renderChunkLayer(chunkId: string): void {
    const chunk = this.chunks.get(chunkId)!;
    const chunkData = this.chunkDataCache.get(chunkId) || [];

    // 创建分块层
    const chunkLayer = new Konva.Layer({
      listening: false, // 非交互层，提高性能
      opacity: this.calculateChunkOpacity(chunk),
    });

    // 创建对象渲染器（这里应该使用独立的ObjectRenderer）
    const objectRenderer = new ObjectRenderer();

    // 渲染分块内的对象
    chunkData.forEach((object) => {
      const node = objectRenderer.createNode(object);
      if (node) {
        chunkLayer.add(node);
      }
    });

    // 设置分块层位置
    chunkLayer.position({
      x: chunk.x,
      y: chunk.y,
    });

    // 添加到容器
    this.chunkContainer.add(chunkLayer);
    this.chunkLayers.set(chunkId, chunkLayer);

    // 应用LOD优化
    this.applyLodToChunk(chunkId, chunkLayer);

    // 标记渲染完成
    chunk.layer = chunkLayer;
    chunk.memoryUsage = this.estimateLayerMemoryUsage(chunkLayer);

    // 触发重绘
    chunkLayer.batchDraw();
  }

  /**
   * 应用细节级别优化到分块
   */
  private applyLodToChunk(chunkId: string, layer: Konva.Layer): void {
    // 这里应该根据当前缩放级别应用LOD优化
    // 简化实现：根据分块距离调整不透明度

    const chunk = this.chunks.get(chunkId)!;
    const distance = this.calculateChunkDistance(chunk);

    if (distance > this.config.chunkSize * 3) {
      layer.opacity(0.7);
    } else if (distance > this.config.chunkSize * 1.5) {
      layer.opacity(0.85);
    }
  }

  /**
   * 计算分块不透明度
   */
  private calculateChunkOpacity(chunk: ChunkMetadata): number {
    // 根据最后访问时间和距离计算不透明度
    const timeSinceAccess = Date.now() - chunk.lastAccessTime;
    const hour = 60 * 60 * 1000;

    if (timeSinceAccess > 5 * hour) {
      return 0.5; // 很长时间未访问
    } else if (timeSinceAccess > hour) {
      return 0.7; // 较长时间未访问
    } else {
      return 1.0; // 最近访问过
    }
  }

  /**
   * 卸载分块
   */
  private unloadChunks(chunkIds: string[]): void {
    chunkIds.forEach((chunkId) => {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) return;

      // 标记为卸载中
      chunk.status = ChunkStatus.UNLOADING;

      // 移除渲染层
      const layer = this.chunkLayers.get(chunkId);
      if (layer) {
        layer.destroy();
        this.chunkLayers.delete(chunkId);
      }

      // 从队列中移除
      this.loadQueue = this.loadQueue.filter(
        (item) => item.chunkId !== chunkId
      );
      this.renderQueue = this.renderQueue.filter(
        (item) => item.chunkId !== chunkId
      );

      // 更新统计信息
      this.stats.loadedChunks--;
      this.stats.unloadedChunks++;
      this.stats.totalObjects -= chunk.objectCount;
      this.stats.loadedObjects -= chunk.objectCount;

      // 清理内存
      this.cleanupChunkMemory(chunkId);

      // 触发事件
      this.emit("chunk-unloaded", {
        chunkId,
        objectCount: chunk.objectCount,
      });

      // 从映射中移除
      this.chunks.delete(chunkId);
    });
  }

  /**
   * 清理分块内存
   */
  private cleanupChunkMemory(chunkId: string): void {
    // 从缓存中移除（根据缓存策略决定）
    if (this.chunkDataCache.size > this.config.cacheSize) {
      // 使用LRU策略清理缓存
      this.cleanupCache();
    }
  }

  /**
   * 清理缓存（LRU策略）
   */
  private cleanupCache(): void {
    if (this.chunkDataCache.size <= this.config.cacheSize) {
      return;
    }

    // 获取所有缓存项并按最后访问时间排序
    const cacheEntries = Array.from(this.chunkDataCache.entries())
      .map(([chunkId, data]) => {
        const chunk = this.chunks.get(chunkId);
        return {
          chunkId,
          data,
          lastAccessTime: chunk?.lastAccessTime || 0,
        };
      })
      .sort((a, b) => a.lastAccessTime - b.lastAccessTime); // 升序，最早访问的在前

    // 清理多余的缓存项
    const itemsToRemove = cacheEntries.slice(
      0,
      this.chunkDataCache.size - this.config.cacheSize
    );

    itemsToRemove.forEach((item) => {
      this.chunkDataCache.delete(item.chunkId);
    });

    this.stats.cachedChunks = this.chunkDataCache.size;
  }

  /**
   * 更新内存统计
   */
  private updateMemoryStats(): void {
    let totalMemory = 0;

    this.chunks.forEach((chunk) => {
      totalMemory += chunk.memoryUsage;
    });

    this.stats.memoryUsage = totalMemory;
  }

  /**
   * 估计层内存使用
   */
  private estimateLayerMemoryUsage(layer: Konva.Layer): number {
    // 简化估计：每个节点约1KB
    const nodeCount = layer.getChildren().length;
    return nodeCount * 1024; // 字节
  }

  /**
   * 获取分块统计信息
   */
  getStats(): ChunkStats {
    return { ...this.stats };
  }

  /**
   * 获取性能监控数据
   */
  getPerformanceMetrics(): any {
    return this.performanceMonitor.getMetrics();
  }

  /**
   * 事件发射器
   */
  private emit(event: string, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => listener(data));
    }
  }

  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * 抽象方法：需要子类实现
   */
  protected async fetchChunkData(chunkId: string): Promise<CanvasObject[]> {
    // 子类应该覆盖这个方法
    throw new Error("fetchChunkData must be implemented by subclass");
  }

  /**
   * 清理资源
   */
  destroy(): void {
    // 清理所有分块
    this.chunks.forEach((chunk, chunkId) => {
      if (chunk.layer) {
        chunk.layer.destroy();
      }
    });

    // 清空所有集合
    this.chunks.clear();
    this.chunkLayers.clear();
    this.chunkDataCache.clear();
    this.loadQueue = [];
    this.renderQueue = [];
    this.activeLoads.clear();
    this.eventListeners.clear();

    // 清理容器
    this.chunkContainer.destroy();
  }
}

/**
 * 性能监控器
 */
class PerformanceMonitor {
  private metrics: Map<string, any> = new Map();
  private startTime: number = performance.now();
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;

  constructor() {
    this.startMonitoring();
  }

  private startMonitoring(): void {
    const updateMetrics = () => {
      this.updateFps();
      this.updateMemory();
      requestAnimationFrame(updateMetrics);
    };

    requestAnimationFrame(updateMetrics);
  }

  private updateFps(): void {
    const now = performance.now();
    this.frameCount++;

    if (now >= this.lastFpsUpdate + 1000) {
      const fps = Math.round(
        (this.frameCount * 1000) / (now - this.lastFpsUpdate)
      );
      this.metrics.set("fps", fps);
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  private updateMemory(): void {
    if (performance.memory) {
      this.metrics.set("memory", {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      });
    }
  }

  recordMetric(name: string, value: any): void {
    this.metrics.set(name, value);
  }

  getMetrics(): any {
    return Object.fromEntries(this.metrics);
  }
}
