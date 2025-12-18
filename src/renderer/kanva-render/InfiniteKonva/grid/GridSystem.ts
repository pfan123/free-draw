// grid/GridSystem.ts
/**
 * 无限画布核心实现 - 网格背景系统 GridSystem
 *
 * 该系统负责在无限画布上绘制动态调整的网格背景，支持多级网格显示、
 * 根据缩放级别调整网格密度、对齐功能以及性能优化等特性。
 */
import Konva from "konva";
import { ViewportManager } from "../viewport/ViewportManager";
import {
  GridConfig,
  GridLevel,
  GridRenderState,
  SnapInfo,
} from "../types/grid-system";

const defaultConfig: GridConfig = {
  enabled: true,
  size: 20,
  color: "#e0e0e0",
  opacity: 0.5,
  lineWidth: 1,
  levels: [
    {
      size: 20, // 主网格
      color: "#b0b0b0",
      opacity: 0.3,
      lineWidth: 1.5,
      visibleZoomRange: [0, 0.5],
      dashPattern: [10, 5],
    },
    {
      size: 40, // 次网格
      color: "#d0d0d0",
      opacity: 0.4,
      lineWidth: 1,
      visibleZoomRange: [0.5, 2],
      dashPattern: [5, 3],
    },
    {
      size: 20, // 基础网格
      color: "#e0e0e0",
      opacity: 0.5,
      lineWidth: 0.5,
      visibleZoomRange: [2, 20],
    },
  ],
  showMajorGrid: true,
  showMinorGrid: true,
  dashEnabled: true,
  dashPattern: [5, 3],
  snapEnabled: true,
  snapThreshold: 5,
  renderQuality: "medium",
  updateDebounce: 100,
};

export class GridSystem {
  private stage: Konva.Stage;
  private viewportManager: ViewportManager; // 依赖基础设施层

  // Konva组件
  private gridLayer: Konva.Layer;
  private gridGroup: Konva.Group;

  // 配置和状态
  private config: GridConfig;
  private renderState: GridRenderState;
  private isRendering: boolean = false;

  // 缓存
  private lastRenderBounds: any = null;
  private renderTimeout: number | null = null;

  constructor(
    stage: Konva.Stage,
    viewportManager: ViewportManager,
    config?: Partial<GridConfig>
  ) {
    this.stage = stage;
    this.viewportManager = viewportManager;

    // 默认配置
    this.config = {
      ...defaultConfig,
      ...config,
    };

    // 创建网格层
    this.gridLayer = new Konva.Layer({
      name: "grid-layer",
      listening: false, // 非交互层，提高性能
      opacity: this.config.opacity,
    });

    this.gridGroup = new Konva.Group();
    this.gridLayer.add(this.gridGroup);

    // 添加到舞台底部
    this.stage.add(this.gridLayer);
    this.gridLayer.moveToBottom();

    // 初始化渲染状态
    this.renderState = {
      visibleBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      zoom: 1,
      viewportOffset: { x: 0, y: 0 },
      activeLevels: [],
      renderTime: 0,
    };

    // 监听视口变化
    this.viewportManager.on(
      "viewport-change",
      this.onViewportChange.bind(this)
    );
  }

  private onViewportChange(viewport: {
    worldX: number;
    worldY: number;
    zoom: number;
    screenWidth: number;
    screenHeight: number;
  }): void {
    this.update(viewport);
  }

  /**
   * 更新网格（视口变化时调用）
   */
  update(viewport: {
    worldX: number;
    worldY: number;
    zoom: number;
    screenWidth: number;
    screenHeight: number;
  }): void {
    if (!this.config.enabled) return;

    // 计算可见区域的世界坐标
    const visibleBounds = this.calculateVisibleBounds(viewport);

    // 检查是否需要重新渲染
    if (this.shouldRender(visibleBounds, viewport.zoom)) {
      // 防抖更新
      if (this.renderTimeout) {
        clearTimeout(this.renderTimeout);
      }

      this.renderTimeout = window.setTimeout(() => {
        this.renderGrid(visibleBounds, viewport);
        this.renderTimeout = null;
      }, this.config.updateDebounce);
    }
  }

  /**
   * 计算可见区域
   */
  private calculateVisibleBounds(viewport: {
    worldX: number;
    worldY: number;
    zoom: number;
    screenWidth: number;
    screenHeight: number;
  }): { minX: number; minY: number; maxX: number; maxY: number } {
    // 屏幕坐标转世界坐标
    const screenToWorld = (screenX: number, screenY: number) => {
      return {
        x: viewport.worldX + screenX / viewport.zoom,
        y: viewport.worldY + screenY / viewport.zoom,
      };
    };

    // 扩展可见区域，确保边缘网格线完整显示
    const padding = this.config.size * 2;

    const topLeft = screenToWorld(-padding, -padding);
    const bottomRight = screenToWorld(
      viewport.screenWidth + padding,
      viewport.screenHeight + padding
    );

    return {
      minX:
        Math.floor(topLeft.x / this.config.size) * this.config.size - padding,
      minY:
        Math.floor(topLeft.y / this.config.size) * this.config.size - padding,
      maxX:
        Math.ceil(bottomRight.x / this.config.size) * this.config.size +
        padding,
      maxY:
        Math.ceil(bottomRight.y / this.config.size) * this.config.size +
        padding,
    };
  }

  /**
   * 检查是否需要重新渲染网格
   */
  private shouldRender(
    newBounds: { minX: number; minY: number; maxX: number; maxY: number },
    zoom: number
  ): boolean {
    if (!this.lastRenderBounds) return true;

    const last = this.lastRenderBounds;
    const threshold = this.config.size * 2; // 2个网格单位的阈值

    return (
      Math.abs(newBounds.minX - last.minX) > threshold ||
      Math.abs(newBounds.minY - last.minY) > threshold ||
      Math.abs(newBounds.maxX - last.maxX) > threshold ||
      Math.abs(newBounds.maxY - last.maxY) > threshold ||
      Math.abs(zoom - this.renderState.zoom) > 0.1
    );
  }

  /**
   * 渲染网格
   */
  private renderGrid(
    visibleBounds: { minX: number; minY: number; maxX: number; maxY: number },
    viewport: any
  ): void {
    if (this.isRendering) return;

    this.isRendering = true;
    const startTime = performance.now();

    // 清空现有网格
    this.gridGroup.destroyChildren();

    // 更新渲染状态
    this.renderState = {
      visibleBounds,
      zoom: viewport.zoom,
      viewportOffset: { x: viewport.worldX, y: viewport.worldY },
      activeLevels: this.getActiveLevels(viewport.zoom),
      renderTime: 0,
    };

    // 根据缩放级别确定要渲染的网格级别
    const activeLevels = this.renderState.activeLevels;

    // 渲染每个级别的网格
    activeLevels.forEach((level) => {
      this.renderGridLevel(level, visibleBounds, viewport);
    });

    // 绘制中心点（可选）
    if (viewport.zoom > 1) {
      this.renderCenterPoint(viewport);
    }

    // 绘制坐标轴（可选）
    if (viewport.zoom > 0.5) {
      this.renderAxes(visibleBounds, viewport);
    }

    // 更新渲染时间
    this.renderState.renderTime = performance.now() - startTime;

    // 批量绘制
    this.gridLayer.batchDraw();

    // 更新缓存
    this.lastRenderBounds = { ...visibleBounds };
    this.isRendering = false;
  }

  /**
   * 获取当前缩放级别下的活动网格级别
   */
  private getActiveLevels(zoom: number): GridLevel[] {
    return this.config.levels.filter((level) => {
      const [minZoom, maxZoom] = level.visibleZoomRange;
      return zoom >= minZoom && zoom <= maxZoom;
    });
  }

  /**
   * 渲染单个网格级别
   */
  private renderGridLevel(
    level: GridLevel,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    viewport: any
  ): void {
    const gridSize = level.size;

    // 计算起始网格线位置（对齐网格）
    const startX = Math.floor(bounds.minX / gridSize) * gridSize;
    const startY = Math.floor(bounds.minY / gridSize) * gridSize;
    const endX = Math.ceil(bounds.maxX / gridSize) * gridSize;
    const endY = Math.ceil(bounds.maxY / gridSize) * gridSize;

    // 渲染垂直线
    for (let x = startX; x <= endX; x += gridSize) {
      const line = new Konva.Line({
        points: [x, bounds.minY, x, bounds.maxY],
        stroke: level.color,
        strokeWidth: this.adjustLineWidth(level.lineWidth, viewport.zoom),
        opacity: level.opacity,
        dash:
          level.dashPattern && viewport.zoom < 2
            ? level.dashPattern
            : undefined,
        lineCap: "round",
        perfectDrawEnabled: false, // 关闭完美绘制，提高性能
        shadowForStrokeEnabled: false,
      });

      this.gridGroup.add(line);
    }

    // 渲染水平线
    for (let y = startY; y <= endY; y += gridSize) {
      const line = new Konva.Line({
        points: [bounds.minX, y, bounds.maxX, y],
        stroke: level.color,
        strokeWidth: this.adjustLineWidth(level.lineWidth, viewport.zoom),
        opacity: level.opacity,
        dash:
          level.dashPattern && viewport.zoom < 2
            ? level.dashPattern
            : undefined,
        lineCap: "round",
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false,
      });

      this.gridGroup.add(line);
    }
  }

  /**
   * 调整线宽（根据缩放级别）
   */
  private adjustLineWidth(baseWidth: number, zoom: number): number {
    // 缩放时线宽应该反比例变化，以保持视觉粗细一致
    const adjusted = baseWidth / zoom;

    // 限制最小和最大线宽
    return Math.max(0.5, Math.min(5, adjusted));
  }

  /**
   * 渲染中心点
   */
  private renderCenterPoint(viewport: any): void {
    const centerX = 0; // 世界坐标系原点
    const centerY = 0;

    // 绘制十字中心点
    const crossSize = 10 / viewport.zoom;

    const horizontalLine = new Konva.Line({
      points: [centerX - crossSize, centerY, centerX + crossSize, centerY],
      stroke: "#ff6b6b",
      strokeWidth: 2 / viewport.zoom,
      opacity: 0.8,
    });

    const verticalLine = new Konva.Line({
      points: [centerX, centerY - crossSize, centerX, centerY + crossSize],
      stroke: "#ff6b6b",
      strokeWidth: 2 / viewport.zoom,
      opacity: 0.8,
    });

    const centerCircle = new Konva.Circle({
      x: centerX,
      y: centerY,
      radius: 3 / viewport.zoom,
      fill: "#ff6b6b",
      opacity: 0.8,
    });

    this.gridGroup.add(horizontalLine);
    this.gridGroup.add(verticalLine);
    this.gridGroup.add(centerCircle);
  }

  /**
   * 渲染坐标轴
   */
  private renderAxes(
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    viewport: any
  ): void {
    // X轴
    if (bounds.minY <= 0 && bounds.maxY >= 0) {
      const xAxis = new Konva.Line({
        points: [bounds.minX, 0, bounds.maxX, 0],
        stroke: "#4ecdc4",
        strokeWidth: 2 / viewport.zoom,
        opacity: 0.6,
        dash: [10, 5],
      });
      this.gridGroup.add(xAxis);
    }

    // Y轴
    if (bounds.minX <= 0 && bounds.maxX >= 0) {
      const yAxis = new Konva.Line({
        points: [0, bounds.minY, 0, bounds.maxY],
        stroke: "#4ecdc4",
        strokeWidth: 2 / viewport.zoom,
        opacity: 0.6,
        dash: [10, 5],
      });
      this.gridGroup.add(yAxis);
    }
  }

  /**
   * 对齐到网格
   */
  snapToGrid(worldPos: { x: number; y: number }): SnapInfo {
    if (!this.config.snapEnabled) {
      return {
        snapped: false,
        target: worldPos,
        distance: 0,
        direction: "both",
      };
    }

    // 使用基础网格大小进行对齐
    const gridSize = this.config.size;

    // 计算最近的网格点
    const snappedX = Math.round(worldPos.x / gridSize) * gridSize;
    const snappedY = Math.round(worldPos.y / gridSize) * gridSize;

    // 计算距离
    const dx = snappedX - worldPos.x;
    const dy = snappedY - worldPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 转换为屏幕像素距离
    const pixelDistance = distance * this.renderState.zoom;

    // 检查是否在对齐阈值内
    const snapped = pixelDistance <= this.config.snapThreshold;

    // 确定对齐方向
    let direction: "horizontal" | "vertical" | "both" = "both";
    if (Math.abs(dx) < 0.001 && Math.abs(dy) > 0.001) {
      direction = "vertical";
    } else if (Math.abs(dy) < 0.001 && Math.abs(dx) > 0.001) {
      direction = "horizontal";
    }

    return {
      snapped,
      target: snapped ? { x: snappedX, y: snappedY } : worldPos,
      distance: pixelDistance,
      direction,
    };
  }

  /**
   * 获取网格交点
   */
  getGridIntersections(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): { x: number; y: number }[] {
    const intersections: { x: number; y: number }[] = [];
    const gridSize = this.config.size;

    // 计算矩形边界
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;

    // 查找与网格线的交点
    const startX = Math.floor(left / gridSize) * gridSize;
    const endX = Math.ceil(right / gridSize) * gridSize;
    const startY = Math.floor(top / gridSize) * gridSize;
    const endY = Math.ceil(bottom / gridSize) * gridSize;

    // 水平网格线与垂直边的交点
    for (let y = startY; y <= endY; y += gridSize) {
      if (y >= top && y <= bottom) {
        intersections.push({ x: left, y });
        intersections.push({ x: right, y });
      }
    }

    // 垂直网格线与水平边的交点
    for (let x = startX; x <= endX; x += gridSize) {
      if (x >= left && x <= right) {
        intersections.push({ x, y: top });
        intersections.push({ x, y: bottom });
      }
    }

    return intersections;
  }

  /**
   * 显示/隐藏网格
   */
  setVisible(visible: boolean): void {
    this.gridLayer.visible(visible);
    this.gridLayer.batchDraw();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<GridConfig>): void {
    this.config = { ...this.config, ...config };

    // 重新渲染网格
    if (this.config.enabled) {
      this.gridGroup.destroyChildren();
      this.lastRenderBounds = null;
    } else {
      this.setVisible(false);
    }
  }

  /**
   * 获取渲染状态
   */
  getRenderState(): GridRenderState {
    return { ...this.renderState };
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }
    this.gridLayer.destroy();
  }
}
