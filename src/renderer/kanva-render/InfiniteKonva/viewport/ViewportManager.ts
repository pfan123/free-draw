import Konva from "konva";
import {
  Vector2D,
  BoundingBox,
  Viewport,
  ViewportConfig,
  ViewportEvent,
  ViewportEventHandler,
  ViewportStats,
} from "../types/viewport";

/**
 * ViewportManager 的核心价值：

  统一管理：集中处理所有视口相关的状态和操作

  坐标转换：提供屏幕↔世界坐标的双向转换

  事件系统：通知其他组件视口变化

  性能优化：节流更新，避免过度渲染

  边界约束：支持视口边界限制

  统计信息：提供性能和使用统计

  这样的设计使得 ViewportManager 成为无限画布架构中的核心协调者，所有需要感知视口的组件都可以通过它获取状态和接收通知。
 */

export class ViewportManager {
  // 核心状态
  private viewport: Viewport = {
    worldX: 0,
    worldY: 0,
    screenX: 0,
    screenY: 0,
  } as Viewport;
  private config: ViewportConfig;
  private stage: Konva.Stage;

  // 事件系统
  private eventHandlers: Map<string, ViewportEventHandler[]> = new Map();

  // 性能统计
  private stats: ViewportStats = {
    zoomLevel: 1,
    viewportCenter: { x: 0, y: 0 },
    visibleArea: 0,
    lastUpdateTime: 0,
    updateCount: 0,
    averageUpdateTime: 0,
  };

  // 节流控制
  private lastUpdateTime: number = 0;
  private updateScheduled: boolean = false;

  constructor(
    stage: Konva.Stage,
    // worldGroup: Konva.Group,
    config?: Partial<ViewportConfig>
  ) {
    this.stage = stage;

    // 默认配置
    this.config = {
      minZoom: 0.1,
      maxZoom: 20,
      defaultZoom: 1,
      zoomStep: 0.2,
      constraints: {
        enabled: false,
      },
      performance: {
        throttleViewportUpdates: true,
        throttleInterval: 16, // ~60fps
        debounceResize: 100,
      },
      ...config,
    };

    // 初始化视口 this.viewport
    this.createInitialViewport();

    // 设置世界组
    this.setupWorldGroup();

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 创建初始视口状态
   */
  private createInitialViewport() {
    const scale = this.config.defaultZoom;
    this.viewport.worldX = 0;
    this.viewport.worldY = 0;
    this.viewport.screenX = 0;
    this.viewport.screenY = 0;
    this.viewport.zoom = scale;
    this.viewport.screenWidth = this.stage.width();
    this.viewport.screenHeight = this.stage.height();
    this.viewport.visibleBounds = this.calculateVisibleBounds(scale);
  }

  /**
   * 设置世界组属性
   */
  private setupWorldGroup(): void {
    // 设置初始位置和缩放
    this.stage.position({ x: 0, y: 0 });
    this.stage.scale({ x: this.viewport.zoom, y: this.viewport.zoom });

    // 启用拖拽（用于平移画布）
    this.stage.draggable(true);

    // 监听拖拽事件，同步视口状态
    this.stage.on("dragstart", () => {
      this.onDragStart();
    });

    this.stage.on("dragmove", () => {
      this.onDragMove();
    });

    this.stage.on("dragend", () => {
      this.onDragEnd();
    });

    this.stage.on("wheel", (e) => {
      this.onWheel(e);
    });
  }

  /**
   * 绑定事件监听器
   */
  private bindEvents(): void {
    // 窗口大小变化
    this.bindResizeEvents();

    // 键盘快捷键
    this.bindKeyboardEvents();
  }

  /**
   * 绑定窗口大小变化事件
   */
  private bindResizeEvents(): void {
    let resizeTimer: number;

    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        this.handleResize();
      }, this.config.performance.debounceResize);
    };

    window.addEventListener("resize", handleResize);

    // 保存清理函数
    this.cleanupFunctions.push(() => {
      window.removeEventListener("resize", handleResize);
    });
  }

  /**
   * 绑定键盘事件
   */
  private bindKeyboardEvents(): void {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target !== this.stage.container()) {
        return;
      }

      this.handleKeyboard(event);
    };

    document.addEventListener("keydown", handleKeyDown);

    this.cleanupFunctions.push(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });
  }

  /**
   * 处理窗口大小变化
   */
  private handleResize(): void {
    const container = this.stage.container();
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 更新舞台尺寸
    this.stage.width(width);
    this.stage.height(height);

    // 更新视口状态
    this.viewport.screenWidth = width;
    this.viewport.screenHeight = height;
    this.viewport.visibleBounds = this.calculateVisibleBounds(
      this.viewport.zoom
    );

    // 触发事件
    this.emitViewportChange("programmatic");
  }

  /**
   * 处理键盘事件
   */
  private handleKeyboard(event: KeyboardEvent): void {
    const panAmount = 100 / this.viewport.zoom; // 根据缩放调整平移量

    switch (event.key) {
      case "+":
      case "=":
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.zoomToCenter(0.1);
        }
        break;

      case "-":
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.zoomToCenter(-0.1);
        }
        break;

      case "0":
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.resetView();
        }
        break;

      case "ArrowUp":
        this.panBy(0, panAmount);
        break;

      case "ArrowDown":
        this.panBy(0, -panAmount);
        break;

      case "ArrowLeft":
        this.panBy(panAmount, 0);
        break;

      case "ArrowRight":
        this.panBy(-panAmount, 0);
        break;

      case " ":
        // Space键用于临时切换到手形工具
        if (!this.isSpacePanning) {
          this.startSpacePanning();
        }
        break;
    }
  }

  // =============== 核心视口操作 ===============

  /**
   * 缩放到指定点
   */
  zoomToPoint(point: Vector2D, deltaZoom: number): void {
    const oldZoom = this.viewport.zoom;
    const newZoom = this.clampZoom(oldZoom + deltaZoom);

    if (oldZoom === newZoom) {
      return;
    }

    this.immediateZoomToPoint(point, oldZoom, newZoom);
  }

  /**
   * 立即缩放到指定点
   */
  private immediateZoomToPoint(
    point: Vector2D,
    oldZoom: number,
    newZoom: number
  ): void {
    // 计算缩放点的世界坐标
    const worldPoint = this.screenToWorld(point);

    // 更新缩放
    this.stage.scale({ x: newZoom, y: newZoom });
    this.viewport.zoom = newZoom;

    // 重新计算缩放后的屏幕位置
    const newScreenPoint = this.worldToScreen(worldPoint);

    // 调整世界组位置，使缩放点保持原位
    const dx = point.x - newScreenPoint.x;
    const dy = point.y - newScreenPoint.y;

    this.stage.x(this.stage.x() + dx);
    this.stage.y(this.stage.y() + dy);

    // 更新视口状态
    this.updateViewportFromWorldGroup();

    // 触发事件
    this.emitZoomEvent("zoom", oldZoom, newZoom);
    this.emitViewportChange("user");
  }

  /**
   * 以画布中心为基准缩放
   */
  zoomToCenter(deltaZoom: number): void {
    const center = {
      x: this.viewport.screenWidth / 2,
      y: this.viewport.screenHeight / 2,
    };
    this.zoomToPoint(center, deltaZoom);
  }

  /**
   * 缩放进入
   */
  zoomIn(animate: boolean = true): void {
    this.zoomToCenter(this.config.zoomStep);
  }

  /**
   * 缩放退出
   */
  zoomOut(animate: boolean = true): void {
    this.zoomToCenter(-this.config.zoomStep);
  }

  /**
   * 平移视口
   */
  panBy(dx: number, dy: number): void {
    this.immediatePanBy(dx, dy);
  }

  /**
   * 立即平移
   */
  private immediatePanBy(dx: number, dy: number): void {
    this.stage.x(this.stage.x() + dx);
    this.stage.y(this.stage.y() + dy);
    this.updateViewportFromWorldGroup();
    this.emitViewportChange("user");
  }

  /**
   * 平移到指定世界坐标
   */
  panTo(worldX: number, worldY: number, animate: boolean = true): void {
    const targetScreenX = -worldX * this.viewport.zoom;
    const targetScreenY = -worldY * this.viewport.zoom;

    this.stage.position({ x: targetScreenX, y: targetScreenY });
    this.updateViewportFromWorldGroup();
    this.emitViewportChange("programmatic");
  }

  /**
   * 将指定点移动到视口中心
   */
  centerOn(worldPoint: Vector2D, animate: boolean = true): void {
    const targetWorldX =
      worldPoint.x - this.viewport.screenWidth / (2 * this.viewport.zoom);
    const targetWorldY =
      worldPoint.y - this.viewport.screenHeight / (2 * this.viewport.zoom);

    this.panTo(targetWorldX, targetWorldY, animate);
  }

  /**
   * 适应指定区域到视口
   */
  fitToBounds(bounds: BoundingBox, padding: number = 50): void {
    // 计算适合的缩放级别
    const scaleX = (this.viewport.screenWidth - padding * 2) / bounds.width;
    const scaleY = (this.viewport.screenHeight - padding * 2) / bounds.height;
    const targetZoom = Math.min(scaleX, scaleY, this.config.maxZoom);

    // 计算中心点
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    this.immediateFitToBounds(centerX, centerY, targetZoom);
  }

  /**
   * 立即适应到区域
   */
  private immediateFitToBounds(
    centerX: number,
    centerY: number,
    targetZoom: number
  ): void {
    const oldZoom = this.viewport.zoom;

    // 先设置缩放
    this.stage.scale({ x: targetZoom, y: targetZoom });
    this.viewport.zoom = targetZoom;

    // 然后居中
    const targetWorldX = centerX - this.viewport.screenWidth / (2 * targetZoom);
    const targetWorldY =
      centerY - this.viewport.screenHeight / (2 * targetZoom);

    this.stage.position({
      x: -targetWorldX * targetZoom,
      y: -targetWorldY * targetZoom,
    });

    this.updateViewportFromWorldGroup();
    this.emitZoomEvent("zoom", oldZoom, targetZoom);
    this.emitViewportChange("programmatic");
  }

  /**
   * 重置视口
   */
  resetView(): void {
    this.panTo(0, 0);
    this.zoomToCenter(this.config.defaultZoom - this.viewport.zoom);
  }

  // =============== 坐标转换 ===============

  /**
   * 屏幕坐标 → 世界坐标
   */
  screenToWorld(screenPos: Vector2D): Vector2D {
    const layerPos = this.stage.position();
    const scale = this.stage.scaleX(); // 假设等比例缩放

    return {
      x: (screenPos.x - layerPos.x) / scale,
      y: (screenPos.y - layerPos.y) / scale,
    };
  }

  /**
   * 世界坐标 → 屏幕坐标
   */
  worldToScreen(worldPos: Vector2D): Vector2D {
    const layerPos = this.stage.position();
    const scale = this.stage.scaleX();

    return {
      x: worldPos.x * scale + layerPos.x,
      y: worldPos.y * scale + layerPos.y,
    };
  }

  /**
   * 获取视口中心的世界坐标
   */
  getViewportCenter(): Vector2D {
    return this.screenToWorld({
      x: this.viewport.screenWidth / 2,
      y: this.viewport.screenHeight / 2,
    });
  }

  // =============== 可见性检测 ===============

  /**
   * 检查世界坐标点是否在视口内
   */
  isPointInViewport(worldPos: Vector2D): boolean {
    const bounds = this.viewport.visibleBounds;
    return (
      worldPos.x >= bounds.minX &&
      worldPos.x <= bounds.maxX &&
      worldPos.y >= bounds.minY &&
      worldPos.y <= bounds.maxY
    );
  }

  /**
   * 检查边界框是否在视口内或相交
   */
  isBoundsInViewport(bounds: BoundingBox): "inside" | "intersect" | "outside" {
    const viewportBounds = this.viewport.visibleBounds;

    // 转换为 min/max 表示
    const boundsMinX = bounds.x;
    const boundsMaxX = bounds.x + bounds.width;
    const boundsMinY = bounds.y;
    const boundsMaxY = bounds.y + bounds.height;

    const viewportMinX = viewportBounds.minX;
    const viewportMaxX = viewportBounds.maxX;
    const viewportMinY = viewportBounds.minY;
    const viewportMaxY = viewportBounds.maxY;

    // 完全在外面
    if (
      boundsMaxX < viewportMinX ||
      boundsMinX > viewportMaxX ||
      boundsMaxY < viewportMinY ||
      boundsMinY > viewportMaxY
    ) {
      return "outside";
    }

    // 完全在里面
    if (
      boundsMinX >= viewportMinX &&
      boundsMaxX <= viewportMaxX &&
      boundsMinY >= viewportMinY &&
      boundsMaxY <= viewportMaxY
    ) {
      return "inside";
    }

    // 相交
    return "intersect";
  }

  /**
   * 获取可见区域边界
   */
  getVisibleBounds(): BoundingBox {
    const bounds = this.viewport.visibleBounds;
    return {
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    };
  }

  // =============== 动画系统 ===============

  /**
   * 插值计算视口状态
   */
  private interpolateViewport(
    start: Viewport,
    end: Viewport,
    t: number
  ): Viewport {
    return {
      worldX: start.worldX + (end.worldX - start.worldX) * t,
      worldY: start.worldY + (end.worldY - start.worldY) * t,
      screenX: start.screenX + (end.screenX - start.screenX) * t,
      screenY: start.screenY + (end.screenY - start.screenY) * t,
      zoom: start.zoom + (end.zoom - start.zoom) * t,
      screenWidth: end.screenWidth,
      screenHeight: end.screenHeight,
      visibleBounds: this.calculateVisibleBounds(
        start.zoom + (end.zoom - start.zoom) * t
      ),
    };
  }

  /**
   * 开始拖拽
   */
  private onDragStart(): void {
    // 触发事件
    this.emitPanEvent("pan-start");
  }

  /**
   * 拖拽移动
   */
  private onDragMove(): void {
    const currentTime = performance.now();

    // 更新视口
    this.updateViewportFromWorldGroup();
    this.emitViewportChange("user");
  }

  /**
   * 拖拽结束
   */
  private onDragEnd(): void {
    // 触发事件
    this.emitPanEvent("pan-end");
  }

  /**   * 处理鼠标滚轮缩放
   */
  private onWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault();

    const scaleBy = 1.05;
    const oldZoom = this.viewport.zoom;
    let newZoom = oldZoom;

    if (e.evt.deltaY < 0) {
      // 向上滚动，放大
      newZoom = this.clampZoom(oldZoom * scaleBy);
    } else {
      // 向下滚动，缩小
      newZoom = this.clampZoom(oldZoom / scaleBy);
    }

    if (oldZoom === newZoom) {
      return;
    }

    const pointer = this.stage.getPointerPosition();
    if (pointer) {
      this.immediateZoomToPoint(pointer, oldZoom, newZoom);
    }
  }

  // =============== 工具方法 ===============

  /**
   * 从世界组位置更新视口状态
   */
  private updateViewportFromWorldGroup(): void {
    const position = this.stage.position();
    const scale = this.stage.scaleX(); // 假设等比例缩放

    this.viewport.screenX = position.x;
    this.viewport.screenY = position.y;
    this.viewport.zoom = scale;
    this.viewport.worldX = -position.x / scale;
    this.viewport.worldY = -position.y / scale;
    this.viewport.visibleBounds = this.calculateVisibleBounds(scale);

    // 应用边界约束
    if (this.config.constraints.enabled) {
      this.applyConstraints();
    }

    // 触发更新（可能节流）
    this.scheduleViewportUpdate();
  }

  /**
   * 应用边界约束
   */
  private applyConstraints(): void {
    const { minX, maxX, minY, maxY } = this.config.constraints;
    let changed = false;

    if (minX !== undefined && this.viewport.worldX < minX) {
      this.viewport.worldX = minX;
      changed = true;
    }
    if (maxX !== undefined && this.viewport.worldX > maxX) {
      this.viewport.worldX = maxX;
      changed = true;
    }
    if (minY !== undefined && this.viewport.worldY < minY) {
      this.viewport.worldY = minY;
      changed = true;
    }
    if (maxY !== undefined && this.viewport.worldY > maxY) {
      this.viewport.worldY = maxY;
      changed = true;
    }

    if (changed) {
      this.viewport.screenX = -this.viewport.worldX * this.viewport.zoom;
      this.viewport.screenY = -this.viewport.worldY * this.viewport.zoom;
      this.stage.position({
        x: this.viewport.screenX,
        y: this.viewport.screenY,
      });
    }
  }

  /**
   * 应用视口状态到世界组
   */
  private applyViewport(viewport: Viewport): void {
    this.stage.position({
      x: viewport.screenX,
      y: viewport.screenY,
    });

    this.stage.scale({
      x: viewport.zoom,
      y: viewport.zoom,
    });

    this.viewport = viewport;
    this.scheduleViewportUpdate();
  }

  /**
   * 计算可见区域
   */
  private calculateVisibleBounds(zoom: number): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    // 屏幕四个角对应的世界坐标
    const screenToWorld = (screenX: number, screenY: number) => {
      return {
        x: (screenX - this.viewport.screenX) / zoom,
        y: (screenY - this.viewport.screenY) / zoom,
      };
    };

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
   * 限制缩放范围
   */
  private clampZoom(zoom: number): number {
    return Math.max(this.config.minZoom, Math.min(this.config.maxZoom, zoom));
  }

  /**
   * 调度视口更新（节流）
   */
  private scheduleViewportUpdate(): void {
    if (!this.config.performance.throttleViewportUpdates) {
      this.emitViewportChange("user");
      return;
    }

    const now = performance.now();

    if (now - this.lastUpdateTime >= this.config.performance.throttleInterval) {
      this.emitViewportChange("user");
      this.lastUpdateTime = now;
      this.updateScheduled = false;
    } else if (!this.updateScheduled) {
      this.updateScheduled = true;

      setTimeout(() => {
        if (this.updateScheduled) {
          this.emitViewportChange("user");
          this.updateScheduled = false;
          this.lastUpdateTime = performance.now();
        }
      }, this.config.performance.throttleInterval);
    }
  }

  // =============== 事件系统 ===============

  /**
   * 触发视口变化事件
   */
  private emitViewportChange(source: ViewportEvent["source"]): void {
    // 更新统计
    this.updateStats();

    const event: ViewportEvent = {
      type: "viewport-change",
      viewport: { ...this.viewport },
      source,
    };

    this.emitEvent("viewport-change", event);
  }

  /**
   * 触发缩放事件
   */
  private emitZoomEvent(
    type: "zoom-start" | "zoom" | "zoom-end",
    oldZoom: number,
    newZoom: number
  ): void {
    const event: ViewportEvent = {
      type,
      viewport: { ...this.viewport },
      delta: { zoom: newZoom - oldZoom },
      source: "user",
    };

    this.emitEvent(type, event);
  }

  /**
   * 触发平移事件
   */
  private emitPanEvent(type: "pan-start" | "pan-end"): void {
    const event: ViewportEvent = {
      type,
      viewport: { ...this.viewport },
      source: "user",
    };

    this.emitEvent(type, event);
  }

  /**
   * 发出事件
   */
  private emitEvent(eventType: string, event: ViewportEvent): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(
            `Error in viewport event handler for ${eventType}:`,
            error
          );
        }
      });
    }
  }

  /**
   * 添加事件监听器
   */
  on(eventType: string, handler: ViewportEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  /**
   * 移除事件监听器
   */
  off(eventType: string, handler: ViewportEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // =============== 统计系统 ===============

  /**
   * 更新性能统计
   */
  private updateStats(): void {
    const now = performance.now();
    const updateTime = now - this.stats.lastUpdateTime;

    this.stats.updateCount++;
    this.stats.averageUpdateTime =
      (this.stats.averageUpdateTime * (this.stats.updateCount - 1) +
        updateTime) /
      this.stats.updateCount;

    this.stats.lastUpdateTime = now;
    this.stats.zoomLevel = this.viewport.zoom;
    this.stats.viewportCenter = this.getViewportCenter();
    this.stats.visibleArea =
      (this.viewport.visibleBounds.maxX - this.viewport.visibleBounds.minX) *
      (this.viewport.visibleBounds.maxY - this.viewport.visibleBounds.minY);
  }

  /**
   * 获取统计信息
   */
  getStats(): ViewportStats {
    return { ...this.stats };
  }

  // =============== 公共API ===============

  /**
   * 获取当前视口状态
   */
  getViewport(): Viewport {
    return { ...this.viewport };
  }

  /**
   * 设置视口状态
   */
  setViewport(viewport: Partial<Viewport>): void {
    const targetViewport: Viewport = {
      ...this.viewport,
      ...viewport,
    };

    if (viewport.zoom !== undefined) {
      targetViewport.zoom = this.clampZoom(viewport.zoom);
    }

    this.applyViewport(targetViewport);
  }

  /**
   * 获取配置
   */
  getConfig(): ViewportConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ViewportConfig>): void {
    this.config = { ...this.config, ...config };

    // 立即应用一些配置更改
    if (config.defaultZoom !== undefined) {
      this.viewport.zoom = this.clampZoom(config.defaultZoom);
      this.stage.scale({ x: this.viewport.zoom, y: this.viewport.zoom });
    }
  }

  /**
   * 获取世界组（供其他系统使用）
   */
  getWorldGroup(): Konva.Group {
    return this.stage;
  }

  /**
   * 获取舞台（供其他系统使用）
   */
  getStage(): Konva.Stage {
    return this.stage;
  }

  // =============== 清理 ===============

  private cleanupFunctions: Function[] = [];

  /**
   * 销毁 ViewportManager
   */
  destroy(): void {
    // 执行清理函数
    this.cleanupFunctions.forEach((fn) => fn());
    this.cleanupFunctions = [];

    // 清理事件监听器
    this.eventHandlers.clear();

    // 移除世界组的事件监听器
    this.stage.off("dragstart");
    this.stage.off("dragmove");
    this.stage.off("dragend");
  }
}
