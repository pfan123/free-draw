// canvas/InfiniteCanvas.ts

/**
 * 无限画布核心实现 - 虚拟视口模式 InfiniteCanvas
 *
 * 该类实现了一个基于Konva.js的无限画布系统，采用虚拟视口的方式管理画布内容。
 * 通过移动和缩放一个可拖拽的世界组（worldGroup），实现对无限空间的浏览和操作。
 * 支持动态分块加载、细节级别（LOD）优化、性能监控等高级功能。
 */
import Konva from "konva";

import { CanvasObject } from "../types/canvas-object";
import {
  VirtualViewportConfig,
  CanvasChunk,
  ViewportState,
  RenderingStats,
} from "../types/infinite-canvas";

export class InfiniteCanvas {
  // Konva核心组件
  private stage: Konva.Stage;
  private worldLayer: Konva.Layer; // 世界层容器
  private worldGroup: Konva.Group; // 可移动的世界组
  private overlayLayer: Konva.Layer; // 覆盖层（UI元素）

  // 视口管理
  private viewport: ViewportState;
  private config: VirtualViewportConfig;

  // 分块管理
  private chunkSize: number;
  private chunks: Map<string, CanvasChunk> = new Map();
  private chunkLayers: Map<string, Konva.Layer> = new Map();

  // 性能优化
  private lastRenderTime: number = 0;
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 60;

  // 渲染队列
  private renderQueue: CanvasChunk[] = [];
  private isRendering: boolean = false;

  // 事件监听
  private listeners: Map<string, Function[]> = new Map();

  constructor(containerId: string, config?: Partial<VirtualViewportConfig>) {
    // 合并配置
    this.config = {
      width: window.innerWidth,
      height: window.innerHeight,
      minZoom: 0.1,
      maxZoom: 20,
      defaultZoom: 1,
      chunkSize: 2000,
      preloadRadius: 1.5,
      cacheSize: 50,
      useLOD: true,
      lodThresholds: { low: 0.3, medium: 0.8, high: 0.8 },
      showGrid: true,
      gridSize: 50,
      gridColor: "#e0e0e0",
      ...config,
    };

    this.chunkSize = this.config.chunkSize;

    // 初始化Stage
    this.initializeStage(containerId);

    // 初始化视口状态
    this.viewport = {
      worldX: 0,
      worldY: 0,
      screenX: 0,
      screenY: 0,
      zoom: this.config.defaultZoom,
      screenWidth: this.config.width,
      screenHeight: this.config.height,
      visibleBounds: this.calculateVisibleBounds(),
    };

    // 设置世界组
    this.setupWorldGroup();

    // 初始化性能监控
    this.setupPerformanceMonitoring();

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 初始化Konva Stage
   * Stage是固定大小的"窗口"，所有内容都通过移动worldGroup来实现
   */
  private initializeStage(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element #${containerId} not found`);
    }

    // 设置容器样式
    container.style.overflow = "hidden";
    container.style.position = "relative";
    container.style.width = "100%";
    container.style.height = "100%";

    // 创建Stage
    this.stage = new Konva.Stage({
      container: containerId,
      width: this.config.width,
      height: this.config.height,
    });

    // 创建世界层（用于放置所有内容）
    this.worldLayer = new Konva.Layer();
    this.stage.add(this.worldLayer);

    // 创建覆盖层（用于UI元素，如选择框、工具提示等）
    this.overlayLayer = new Konva.Layer();
    this.stage.add(this.overlayLayer);
  }

  /**
   * 设置世界组
   * worldGroup是可移动的容器，所有对象都添加到这里
   */
  private setupWorldGroup(): void {
    this.worldGroup = new Konva.Group({
      x: 0,
      y: 0,
      scaleX: this.viewport.zoom,
      scaleY: this.viewport.zoom,
      draggable: true, // 允许拖拽来实现平移
    });

    // 监听拖拽事件，更新视口状态
    this.worldGroup.on("dragmove", () => {
      this.updateViewportFromWorldGroup();
      this.updateVisibleChunks();
      this.emit("viewport-change", this.viewport);
    });

    // 添加到世界层
    this.worldLayer.add(this.worldGroup);
  }

  /**
   * 根据worldGroup的位置和缩放更新视口状态
   */
  private updateViewportFromWorldGroup(): void {
    const position = this.worldGroup.position();
    const scale = this.worldGroup.scaleX(); // 假设等比例缩放

    this.viewport.screenX = position.x;
    this.viewport.screenY = position.y;
    this.viewport.zoom = scale;

    // 计算世界坐标：世界坐标 = (屏幕坐标 - 偏移) / 缩放
    this.viewport.worldX = -position.x / scale;
    this.viewport.worldY = -position.y / scale;

    // 更新可见区域
    this.viewport.visibleBounds = this.calculateVisibleBounds();
  }

  /**
   * 计算当前视口在世界坐标系中的可见范围
   */
  private calculateVisibleBounds(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const screenToWorld = (screenX: number, screenY: number) => {
      return {
        x: (screenX - this.viewport.screenX) / this.viewport.zoom,
        y: (screenY - this.viewport.screenY) / this.viewport.zoom,
      };
    };

    // 屏幕四个角对应的世界坐标
    const topLeft = screenToWorld(0, 0);
    const topRight = screenToWorld(this.viewport.screenWidth, 0);
    const bottomLeft = screenToWorld(0, this.viewport.screenHeight);
    const bottomRight = screenToWorld(
      this.viewport.screenWidth,
      this.viewport.screenHeight
    );

    // 计算边界
    const minX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);

    return { minX, minY, maxX, maxY };
  }

  /**
   * 坐标转换：屏幕坐标 -> 世界坐标
   */
  screenToWorld(screenPos: { x: number; y: number }): { x: number; y: number } {
    return {
      x: (screenPos.x - this.viewport.screenX) / this.viewport.zoom,
      y: (screenPos.y - this.viewport.screenY) / this.viewport.zoom,
    };
  }

  /**
   * 坐标转换：世界坐标 -> 屏幕坐标
   */
  worldToScreen(worldPos: { x: number; y: number }): { x: number; y: number } {
    return {
      x: worldPos.x * this.viewport.zoom + this.viewport.screenX,
      y: worldPos.y * this.viewport.zoom + this.viewport.screenY,
    };
  }

  /**
   * 获取包含预加载区域的可见分块ID
   */
  private getVisibleChunkIds(): string[] {
    const bounds = this.viewport.visibleBounds;
    const chunkIds: string[] = [];

    // 扩展预加载区域
    const expandedBounds = {
      minX: bounds.minX - this.config.chunkSize * this.config.preloadRadius,
      minY: bounds.minY - this.config.chunkSize * this.config.preloadRadius,
      maxX: bounds.maxX + this.config.chunkSize * this.config.preloadRadius,
      maxY: bounds.maxY + this.config.chunkSize * this.config.preloadRadius,
    };

    // 计算分块范围
    const startChunkX = Math.floor(expandedBounds.minX / this.chunkSize);
    const startChunkY = Math.floor(expandedBounds.minY / this.chunkSize);
    const endChunkX = Math.floor(expandedBounds.maxX / this.chunkSize);
    const endChunkY = Math.floor(expandedBounds.maxY / this.chunkSize);

    // 生成分块ID
    for (let x = startChunkX; x <= endChunkX; x++) {
      for (let y = startChunkY; y <= endChunkY; y++) {
        chunkIds.push(`${x}_${y}`);
      }
    }

    return chunkIds;
  }

  /**
   * 更新可见分块
   * 核心功能：动态加载/卸载分块
   */
  private async updateVisibleChunks(): Promise<void> {
    const visibleChunkIds = this.getVisibleChunkIds();
    const currentChunkIds = Array.from(this.chunks.keys());

    // 需要卸载的分块（不再可见）
    const chunksToRemove = currentChunkIds.filter(
      (id) => !visibleChunkIds.includes(id)
    );

    // 需要加载的分块（新可见的）
    const chunksToLoad = visibleChunkIds.filter(
      (id) => !currentChunkIds.includes(id)
    );

    // 卸载不可见的分块
    this.unloadChunks(chunksToRemove);

    // 加载新分块
    await this.loadChunks(chunksToLoad);

    // 更新分块访问时间（用于缓存清理）
    visibleChunkIds.forEach((id) => {
      const chunk = this.chunks.get(id);
      if (chunk) {
        chunk.lastAccess = Date.now();
      }
    });
  }

  /**
   * 加载分块数据
   */
  private async loadChunks(chunkIds: string[]): Promise<void> {
    const loadPromises = chunkIds.map(async (chunkId) => {
      // 检查是否已在加载中
      if (this.chunks.has(chunkId)) {
        return;
      }

      // 创建分块记录
      const [x, y] = chunkId.split("_").map(Number);
      const chunk: CanvasChunk = {
        id: chunkId,
        x: x * this.chunkSize,
        y: y * this.chunkSize,
        width: this.chunkSize,
        height: this.chunkSize,
        objects: [],
        loaded: false,
        rendering: false,
        lastAccess: Date.now(),
      };

      this.chunks.set(chunkId, chunk);

      try {
        // 异步加载分块数据
        chunk.objects = await this.loadChunkData(x, y);
        chunk.loaded = true;

        // 添加到渲染队列
        this.renderQueue.push(chunk);

        // 触发渲染
        this.scheduleRender();

        this.emit("chunk-loaded", chunk);
      } catch (error) {
        console.error(`Failed to load chunk ${chunkId}:`, error);
        this.chunks.delete(chunkId);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * 卸载分块
   */
  private unloadChunks(chunkIds: string[]): void {
    chunkIds.forEach((chunkId) => {
      const chunk = this.chunks.get(chunkId);
      if (chunk) {
        // 移除对应的Konva层
        const layer = this.chunkLayers.get(chunkId);
        if (layer) {
          layer.destroy();
          this.chunkLayers.delete(chunkId);
        }

        // 从队列中移除
        this.renderQueue = this.renderQueue.filter((c) => c.id !== chunkId);

        // 删除分块记录
        this.chunks.delete(chunkId);

        this.emit("chunk-unloaded", chunk);
      }
    });
  }

  /**
   * 渲染分块内容
   */
  private renderChunk(chunk: CanvasChunk): void {
    if (chunk.rendering || !chunk.loaded) {
      return;
    }

    chunk.rendering = true;

    // 创建分块层
    const chunkLayer = new Konva.Layer({
      listening: false, // 非交互层，提高性能
      opacity: this.config.useLOD ? this.getChunkOpacity() : 1,
    });

    // 渲染分块内的对象
    chunk.objects.forEach((object) => {
      const node = this.createKonvaNode(object);
      if (node) {
        chunkLayer.add(node);
      }
    });

    // 设置分块层位置
    chunkLayer.position({
      x: chunk.x,
      y: chunk.y,
    });

    // 应用LOD优化
    if (this.config.useLOD) {
      this.applyLodToLayer(chunkLayer, chunk);
    }

    // 添加到世界组
    this.worldGroup.add(chunkLayer);
    this.chunkLayers.set(chunk.id, chunkLayer);

    // 标记渲染完成
    chunk.rendering = false;
    chunkLayer.batchDraw();

    this.emit("chunk-rendered", chunk);
  }

  /**
   * 调度渲染
   */
  private scheduleRender(): void {
    if (this.isRendering || this.renderQueue.length === 0) {
      return;
    }

    this.isRendering = true;

    // 使用requestAnimationFrame实现渐进式渲染
    const renderNext = () => {
      const startTime = performance.now();
      let renderedCount = 0;

      // 每帧最多渲染3个分块，避免阻塞主线程
      while (this.renderQueue.length > 0 && renderedCount < 3) {
        const chunk = this.renderQueue.shift();
        if (chunk) {
          this.renderChunk(chunk);
          renderedCount++;
        }
      }

      // 记录渲染时间
      this.lastRenderTime = performance.now() - startTime;

      if (this.renderQueue.length > 0) {
        // 还有更多分块需要渲染，继续下一帧
        requestAnimationFrame(renderNext);
      } else {
        // 渲染完成
        this.isRendering = false;
        this.worldLayer.batchDraw();
        this.emit("render-complete");
      }
    };

    requestAnimationFrame(renderNext);
  }

  /**
   * 应用LOD（细节级别）优化
   */
  private applyLodToLayer(layer: Konva.Layer, chunk: CanvasChunk): void {
    const zoom = this.viewport.zoom;
    const lod = this.getLodLevel(zoom);

    switch (lod) {
      case "low":
        // 低细节：简化渲染
        layer.opacity(0.7);
        layer.children?.forEach((node: Konva.Node) => {
          if (node instanceof Konva.Shape) {
            node.shadowEnabled(false);
            if (node.strokeWidth() > 1) {
              node.strokeWidth(1);
            }
          }
        });
        break;

      case "medium":
        // 中细节：部分优化
        layer.opacity(0.9);
        break;

      case "high":
        // 高细节：完整渲染
        layer.opacity(1);
        break;
    }
  }

  /**
   * 获取当前LOD级别
   */
  private getLodLevel(zoom: number): "low" | "medium" | "high" {
    const { low, medium } = this.config.lodThresholds;
    if (zoom < low) return "low";
    if (zoom < medium) return "medium";
    return "high";
  }

  /**
   * 获取分块不透明度（基于距离视口中心的距离）
   */
  private getChunkOpacity(): number {
    const viewportCenter = {
      x:
        this.viewport.worldX +
        this.viewport.screenWidth / (2 * this.viewport.zoom),
      y:
        this.viewport.worldY +
        this.viewport.screenHeight / (2 * this.viewport.zoom),
    };

    // 计算最近的分块距离
    let minDistance = Infinity;
    this.chunks.forEach((chunk) => {
      const chunkCenter = {
        x: chunk.x + chunk.width / 2,
        y: chunk.y + chunk.height / 2,
      };

      const distance = Math.sqrt(
        Math.pow(chunkCenter.x - viewportCenter.x, 2) +
          Math.pow(chunkCenter.y - viewportCenter.y, 2)
      );

      minDistance = Math.min(minDistance, distance);
    });

    // 根据距离计算不透明度（越远越透明）
    const maxDistance =
      Math.max(this.viewport.screenWidth, this.viewport.screenHeight) /
      this.viewport.zoom;
    const opacity = 1 - Math.min(minDistance / maxDistance, 0.5);

    return Math.max(0.5, opacity);
  }

  /**
   * 创建Konva节点
   */
  private createKonvaNode(object: CanvasObject): Konva.Node | null {
    // 这里应该调用ObjectRenderer来创建节点
    // 简化实现，实际应该使用完整的渲染器
    switch (object.type) {
      case "rectangle":
        return new Konva.Rect({
          x: object.position.x,
          y: object.position.y,
          width: object.size.x,
          height: object.size.y,
          fill: object.style.fill as string,
          stroke: object.style.stroke?.color as string,
          strokeWidth: object.style.stroke?.width || 1,
        });
      // ... 其他类型的创建逻辑
      default:
        return null;
    }
  }

  /**
   * 缩放视口
   */
  zoomToPoint(point: { x: number; y: number }, delta: number): void {
    const oldZoom = this.viewport.zoom;
    const newZoom = Math.max(
      this.config.minZoom,
      Math.min(this.config.maxZoom, oldZoom + delta)
    );

    if (oldZoom === newZoom) return;

    // 计算缩放点的世界坐标
    const worldPoint = this.screenToWorld(point);

    // 更新缩放
    this.worldGroup.scale({ x: newZoom, y: newZoom });
    this.viewport.zoom = newZoom;

    // 重新计算缩放后的屏幕位置
    const newScreenPoint = this.worldToScreen(worldPoint);

    // 调整位置使缩放点保持不变
    const dx = point.x - newScreenPoint.x;
    const dy = point.y - newScreenPoint.y;

    this.worldGroup.x(this.worldGroup.x() + dx);
    this.worldGroup.y(this.worldGroup.y() + dy);

    // 更新视口状态
    this.updateViewportFromWorldGroup();

    // 更新可见分块（缩放会影响可见区域）
    this.updateVisibleChunks();

    // 更新所有分块的LOD
    this.updateChunksLOD();

    this.emit("zoom", { oldZoom, newZoom, point });
    this.emit("viewport-change", this.viewport);
  }

  /**
   * 更新所有分块的LOD
   */
  private updateChunksLOD(): void {
    this.chunkLayers.forEach((layer, chunkId) => {
      const chunk = this.chunks.get(chunkId);
      if (chunk) {
        this.applyLodToLayer(layer, chunk);
      }
    });
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    // 鼠标滚轮缩放
    this.stage.on("wheel", (e) => {
      e.evt.preventDefault();

      if (e.evt.ctrlKey || e.evt.metaKey) {
        const point = this.stage.getPointerPosition()!;
        const delta = e.evt.deltaY > 0 ? -0.1 : 0.1;
        this.zoomToPoint(point, delta);
      }
    });

    // 窗口大小变化
    window.addEventListener("resize", () => {
      this.handleResize();
    });
  }

  /**
   * 处理窗口大小变化
   */
  private handleResize(): void {
    const container = this.stage.container();
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.stage.width(width);
    this.stage.height(height);

    this.viewport.screenWidth = width;
    this.viewport.screenHeight = height;

    this.updateVisibleChunks();
    this.emit("resize", { width, height });
  }

  /**
   * 设置性能监控
   */
  private setupPerformanceMonitoring(): void {
    const updateFps = () => {
      const now = performance.now();
      this.frameCount++;

      if (now >= this.lastFpsUpdate + 1000) {
        this.currentFps = Math.round(
          (this.frameCount * 1000) / (now - this.lastFpsUpdate)
        );
        this.frameCount = 0;
        this.lastFpsUpdate = now;

        this.emit("fps-update", this.currentFps);
      }

      requestAnimationFrame(updateFps);
    };

    requestAnimationFrame(updateFps);
  }

  /**
   * 获取渲染统计信息
   */
  getRenderingStats(): RenderingStats {
    const visibleChunkIds = this.getVisibleChunkIds();
    const visibleChunks = Array.from(this.chunks.values()).filter((chunk) =>
      visibleChunkIds.includes(chunk.id)
    );

    const totalObjects = Array.from(this.chunks.values()).reduce(
      (sum, chunk) => sum + chunk.objects.length,
      0
    );

    const visibleObjects = visibleChunks.reduce(
      (sum, chunk) => sum + chunk.objects.length,
      0
    );

    return {
      totalChunks: this.chunks.size,
      loadedChunks: Array.from(this.chunks.values()).filter((c) => c.loaded)
        .length,
      visibleChunks: visibleChunks.length,
      totalObjects,
      visibleObjects,
      renderTime: this.lastRenderTime,
      fps: this.currentFps,
      memoryUsage: performance.memory ? performance.memory.usedJSHeapSize : 0,
    };
  }

  /**
   * 事件发射器
   */
  private emit(event: string, data?: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => listener(data));
    }
  }

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 加载分块数据（抽象方法，需要子类实现）
   */
  protected async loadChunkData(x: number, y: number): Promise<CanvasObject[]> {
    // 子类应该覆盖这个方法
    return [];
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.chunks.clear();
    this.chunkLayers.forEach((layer) => layer.destroy());
    this.chunkLayers.clear();
    this.stage.destroy();
    this.listeners.clear();
  }
}
