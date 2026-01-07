// canvas/InfiniteKonvaCanvas.ts
import Konva from "konva";
import { ChunkedCanvas } from "./ChunkedCanvas";
import { ViewportManager } from "../viewport/ViewportManager";
import { ViewportEvent } from "../types/viewport";
import { GridSystem } from "../grid/GridSystem";
import { EventSystem } from "../events/EventSystem";
import { MemoryManager } from "../performance/MemoryManager";
import { PerformanceOptimizer } from "../performance/PerformanceOptimizer";
import { ObjectRenderer } from "../renderer/ObjectRenderer";

import { CanvasObject } from "../types/canvas-object";

import { VirtualViewportConfig } from "../types/infinite-canvas";

import { GridConfig } from "../types/grid-system";

import { EventSystemConfig } from "../types/event-system";

import { MemoryManagerConfig } from "../types/memory-manager";
import { PerformanceConfig } from "../types/performance-optimizer";
import { CanvasDataSource } from "../data/sources/base/CanvasDataSource";
import { MemoryDataSource } from "../data/sources/local/MemoryDataSource";

/**
 * 完整无限画布配置
 */
export interface InfiniteCanvasConfig {
  container: HTMLDivElement; // 容器元素ID
  dataSource?: {
    type: "localStorage" | "indexedDB" | "rest" | "hybrid" | "custom";
    config?: any;
  };
  viewport?: Partial<VirtualViewportConfig>;
  grid?: Partial<GridConfig>;
  events?: Partial<EventSystemConfig>;
  memory?: Partial<MemoryManagerConfig>;
  performance?: Partial<PerformanceConfig>;
  chunk?: Partial<any>; // ChunkedCanvas配置
}

/**
 * 画布状态
 */
export interface CanvasState {
  viewport: any;
  grid: any;
  events: any;
  performance: any;
  memory: any;
  objects: CanvasObject[];
  selectedObjects: string[];
}

export class InfiniteKonvaCanvas {
  // 核心组件
  private stage: Konva.Stage;
  private chunkedCanvas!: ChunkedCanvas;
  private viewportManager!: ViewportManager;
  private gridSystem!: GridSystem;
  private eventSystem!: EventSystem;

  // 性能优化组件
  private memoryManager!: MemoryManager;
  private performanceOptimizer!: PerformanceOptimizer;
  private objectRenderer!: ObjectRenderer;

  // 主要层
  private mainLayer!: Konva.Layer;

  // 状态管理
  private state: CanvasState;
  private config: InfiniteCanvasConfig;

  // 数据源（可以是本地存储或远程API）
  private dataSource: CanvasDataSource;

  constructor(config: InfiniteCanvasConfig) {
    this.config = config;

    // 验证容器
    const container = config.container;
    if (!container) {
      throw new Error(`Container #${config.container} not found`);
    }

    // 初始化Stage
    this.stage = this.createStage(container);

    // 初始化状态
    this.state = {
      viewport: {},
      grid: {},
      events: {},
      performance: {},
      memory: {},
      objects: [],
      selectedObjects: [],
    };

    // 初始化数据源（核心！）
    // 根据配置选择数据源实现，默认使用内存实现
    this.dataSource = new MemoryDataSource();

    // 初始化组件
    this.initializeComponents();

    // 绑定事件
    this.bindEvents();

    // 初始渲染
    this.render();
  }

  /**
   * 创建Konva Stage
   */
  private createStage(container: HTMLDivElement): Konva.Stage {
    // 设置容器样式
    container.style.overflow = "hidden";
    container.style.position = "relative";

    // 创建Stage，可移动和缩放容器
    const stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
    });

    return stage;
  }

  /**
   * 初始化所有组件
   */
  private initializeComponents(): void {
    // 创建世界组
    this.mainLayer = new Konva.Layer();
    this.stage.add(this.mainLayer);

    // 1. 视口管理器
    this.viewportManager = new ViewportManager(
      this.stage,
      // worldLayer, // 临时group，会被chunkedCanvas替换
      this.config.viewport
    );

    // 2. 分块画布
    this.chunkedCanvas = new ChunkedCanvas(this.stage, this.config.chunk);

    // 3. 网格系统
    this.gridSystem = new GridSystem(
      this.stage,
      this.viewportManager,
      this.config.grid
    );

    // 4. 事件系统
    // this.eventSystem = new EventSystem(
    //   this.stage,
    //   this.chunkedCanvas.getWorldGroup(),
    //   this.config.events
    // );

    // 5. 内存管理器
    this.memoryManager = new MemoryManager(this.config.memory);

    // 6. 性能优化器
    this.performanceOptimizer = new PerformanceOptimizer(
      this.stage,
      this.config.performance
    );

    // 7. 对象渲染器
    this.objectRenderer = new ObjectRenderer();

    // 连接组件
    this.connectComponents();

    // 6. 初始化数据加载
    this.initializeData();
  }

  /**
   * 初始化数据加载
   */
  private async initializeData() {
    await this.dataSource.initialize();
    const testObjects = [
      {
        id: "test-rect",
        type: "rectangle",
        position: { x: 100, y: 100 },
        size: { x: 200, y: 150 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        zIndex: 0,
        style: {
          fill: "#4CAF50",
          stroke: { color: "#2E7D32", width: 2 },
        },
        properties: { cornerRadius: 10 },
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: "system",
          version: 1,
          visible: true,
          locked: false,
        },
      },
    ];

    this.objectRenderer.renderToLayer(
      testObjects,
      this.mainLayer,
      this.state.viewport
    );

    // 批量创建
    const createResult = await this.dataSource.createObjects(testObjects);

    console.error("createResult", createResult);
  }

  /**
   * 连接各个组件
   */
  private connectComponents(): void {
    // 视口变化时更新网格和分块
    this.viewportManager.on("viewport-change", (data: ViewportEvent) => {
      // this.chunkedCanvas.updateViewport(viewport);

      // 更新性能优化器的LOD
      // this.performanceOptimizer.updateViewport(viewport);

      // 更新状态
      this.state.viewport = data.viewport;
    });

    // // 事件系统处理用户交互
    // this.eventSystem.on("dragmove", (event) => {
    //   // 更新视口位置
    //   this.viewportManager.handleDrag(event);
    // });

    // this.eventSystem.on("wheel", (event) => {
    //   // 处理缩放
    //   this.viewportManager.handleZoom(event);
    // });

    // 开始性能监控
    this.startPerformanceMonitoring.bind(this)();
  }

  /**
   * 性能监控
   */
  startPerformanceMonitoring(): void {
    const metrics = this.performanceOptimizer.getMetrics();
    const memory = this.memoryManager.getMetrics();

    this.state.performance = metrics;
    this.state.memory = memory;

    // 如果性能下降，触发优化
    if (metrics.fps < 30) {
      this.triggerOptimization();
    }

    requestAnimationFrame(this.startPerformanceMonitoring.bind(this));
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    // 窗口大小变化
    window.addEventListener("resize", () => {
      this.handleResize();
    });

    // 键盘快捷键
    document.addEventListener("keydown", (e) => {
      this.handleKeyboard(e);
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

    // 通知视口管理器
    this.viewportManager.handleResize(width, height);
  }

  /**
   * 处理键盘事件
   */
  private handleKeyboard(event: KeyboardEvent): void {
    switch (event.key) {
      case "+":
      case "=":
        this.viewportManager.zoomIn();
        break;
      case "-":
        this.viewportManager.zoomOut();
        break;
      case "0":
        this.viewportManager.resetView();
        break;
      case "Delete":
        this.deleteSelectedObjects();
        break;
      case "Escape":
        this.clearSelection();
        break;
    }
  }

  /**
   * 添加对象到画布
   */
  async addObject(object: CanvasObject): Promise<void> {
    // 添加到状态
    this.state.objects.push(object);

    // 添加到数据源
    await this.dataSource.saveObject(object);

    // 确定对象所在的分块
    const chunkId = this.getChunkIdForObject(object);

    // 通知分块画布更新
    this.chunkedCanvas.addObjectToChunk(chunkId, object);

    // 注册对象到内存管理器
    this.memoryManager.registerObject(object, "canvas-object");

    // 触发渲染
    this.scheduleRender();
  }

  /**
   * 获取对象所在的分块ID
   */
  private getChunkIdForObject(object: CanvasObject): string {
    const chunkSize = 2000; // 与ChunkedCanvas配置一致
    const chunkX = Math.floor(object.position.x / chunkSize);
    const chunkY = Math.floor(object.position.y / chunkSize);

    return `${chunkX}_${chunkY}`;
  }

  /**
   * 批量添加对象
   */
  async addObjects(objects: CanvasObject[]): Promise<void> {
    // 使用性能优化器进行批处理
    const batchId = this.performanceOptimizer.scheduleRender(
      () => this.processBatchAdd(objects),
      100 // 高优先级
    );

    // await this.performanceOptimizer.waitForBatch(batchId);
  }

  /**
   * 处理批量添加
   */
  private async processBatchAdd(objects: CanvasObject[]): Promise<void> {
    // 按分块分组
    const objectsByChunk = new Map<string, CanvasObject[]>();

    objects.forEach((object) => {
      const chunkId = this.getChunkIdForObject(object);

      if (!objectsByChunk.has(chunkId)) {
        objectsByChunk.set(chunkId, []);
      }

      objectsByChunk.get(chunkId)!.push(object);
    });

    // 批量添加到数据源
    await this.dataSource.saveObjects(objects);

    // 更新各个分块
    for (const [chunkId, chunkObjects] of objectsByChunk) {
      this.chunkedCanvas.addObjectsToChunk(chunkId, chunkObjects);
    }

    // 更新状态
    this.state.objects.push(...objects);

    // 注册到内存管理器
    objects.forEach((object) => {
      this.memoryManager.registerObject(object, "canvas-object");
    });
  }

  /**
   * 删除选中的对象
   */
  async deleteSelectedObjects(): Promise<void> {
    if (this.state.selectedObjects.length === 0) {
      return;
    }

    const objectsToDelete = this.state.objects.filter((obj) =>
      this.state.selectedObjects.includes(obj.id)
    );

    // 从数据源删除
    await this.dataSource.deleteObjects(this.state.selectedObjects);

    // 从状态中移除
    this.state.objects = this.state.objects.filter(
      (obj) => !this.state.selectedObjects.includes(obj.id)
    );

    // 从各个分块中移除
    objectsToDelete.forEach((object) => {
      const chunkId = this.getChunkIdForObject(object);
      this.chunkedCanvas.removeObjectFromChunk(chunkId, object.id);
    });

    // 从内存管理器注销
    objectsToDelete.forEach((object) => {
      this.memoryManager.unregisterObject(object);
    });

    // 清空选择
    this.clearSelection();

    // 触发渲染
    this.scheduleRender();
  }

  /**
   * 清空选择
   */
  clearSelection(): void {
    this.state.selectedObjects = [];
    this.eventSystem.clearSelection();
  }

  /**
   * 选择对象
   */
  selectObject(objectId: string): void {
    if (!this.state.selectedObjects.includes(objectId)) {
      this.state.selectedObjects.push(objectId);
    }
  }

  /**
   * 触发性能优化
   */
  private triggerOptimization(): void {
    console.log("Triggering performance optimization...");

    // 1. 清理内存
    this.memoryManager.performCleanup({
      aggressive: true,
      preserveVisible: true,
      targetMemory: 100 * 1024 * 1024, // 100MB
    });

    // 2. 清理缓存
    this.performanceOptimizer.clearCache();
    this.objectRenderer.clearCache();

    // 3. 降低LOD级别
    // this.performanceOptimizer.reduceLOD();

    // 4. 限制渲染频率
    // this.performanceOptimizer.throttleRendering();
  }

  /**
   * 调度渲染
   */
  private renderScheduled = false;
  private scheduleRender(): void {
    if (!this.renderScheduled) {
      this.renderScheduled = true;
      requestAnimationFrame(() => {
        this.render();
        this.renderScheduled = false;
      });
    }
  }

  /**
   * 主渲染方法
   */
  private render(): void {
    // 开始性能监控
    const renderStart = performance.now();

    // 更新网格
    const viewport = this.viewportManager.getViewport();
    this.gridSystem.update(viewport);

    // 更新分块画布
    // this.chunkedCanvas.render();

    // 绘制选中框等覆盖层
    this.renderOverlay();

    // 批量绘制结束
    this.stage.draw();

    // 记录渲染时间
    const renderTime = performance.now() - renderStart;
    // this.performanceOptimizer.recordRenderTime(renderTime);
  }

  /**
   * 渲染覆盖层（选中框、工具提示等）
   */
  private renderOverlay(): void {
    // 这里应该渲染选中框等UI元素
    // 简化实现
  }

  /**
   * 获取画布状态
   */
  getState(): CanvasState {
    return { ...this.state };
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): any {
    return {
      viewport: this.viewportManager.getStats(),
      chunks: this.chunkedCanvas.getStats(),
      performance: this.performanceOptimizer.getMetrics(),
      memory: this.memoryManager.getMetrics(),
      lod: this.performanceOptimizer.getLODState(),
    };
  }

  /**
   * 导出画布为图片
   */
  async exportToImage(options?: {
    format?: "png" | "jpeg";
    quality?: number;
    area?: any;
  }): Promise<string> {
    const opts = {
      format: "png" as const,
      quality: 1,
      area: null,
      ...options,
    };

    // 创建临时Stage用于导出
    const tempStage = new Konva.Stage({
      width: this.stage.width(),
      height: this.stage.height(),
    });

    // 复制可见内容
    // 这里需要实现完整的导出逻辑

    return tempStage.toDataURL({
      mimeType: `image/${opts.format}`,
      quality: opts.quality,
    });
  }

  /**
   * 保存画布状态
   */
  async saveState(): Promise<void> {
    const state = {
      objects: this.state.objects,
      viewport: this.state.viewport,
      timestamp: Date.now(),
    };

    await this.dataSource.saveState(state);
  }

  /**
   * 加载画布状态
   */
  async loadState(stateId?: string): Promise<void> {
    const state = await this.dataSource.loadState(stateId);

    if (state) {
      // 清除当前状态
      this.clearAll();

      // 加载新状态
      this.state.objects = state.objects || [];
      this.state.viewport = state.viewport || {};

      // 重置视口
      if (state.viewport) {
        this.viewportManager.setViewport(state.viewport);
      }

      // 重新加载对象
      await this.reloadObjects();
    }
  }

  /**
   * 重新加载所有对象
   */
  private async reloadObjects(): Promise<void> {
    // 清除所有分块
    this.chunkedCanvas.clearAll();

    // 重新添加对象
    await this.addObjects(this.state.objects);
  }

  /**
   * 清除所有内容
   */
  clearAll(): void {
    this.state.objects = [];
    this.state.selectedObjects = [];

    this.chunkedCanvas.clearAll();
    this.memoryManager.clearAll();
    this.performanceOptimizer.clearCache();

    this.scheduleRender();
  }

  /**
   * 销毁画布
   */
  destroy(): void {
    // 销毁所有组件
    this.chunkedCanvas.destroy();
    this.viewportManager.destroy();
    this.gridSystem.destroy();
    this.eventSystem.destroy();
    this.memoryManager.destroy();
    this.performanceOptimizer.destroy();

    // 销毁Stage
    this.stage.destroy();

    // 清理事件监听器
    window.removeEventListener("resize", this.handleResize.bind(this));
    document.removeEventListener("keydown", this.handleKeyboard.bind(this));
  }
}
