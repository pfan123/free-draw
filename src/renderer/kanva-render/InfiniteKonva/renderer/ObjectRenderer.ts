// renderer/ObjectRenderer.ts
import Konva from "konva";

import {
  CanvasObject,
  ObjectType,
  Vector2D,
  RenderConfig,
} from "../types/canvas-object";

export class ObjectRenderer {
  // Konva节点缓存（按对象ID和版本号）
  private nodeCache = new Map<string, Konva.Shape>();

  // 图片资源缓存
  private imageCache = new Map<string, HTMLImageElement>();

  // 当前渲染配置
  private config: RenderConfig = {
    useCache: true,
    batchDraw: true,
    simplifyOnZoomOut: true,
    lodThresholds: { low: 0.3, medium: 0.8, high: 0.8 },
  };

  // 当前缩放级别（用于LOD）
  private currentZoom = 1;

  // 可见对象集合（用于优化）
  private visibleObjects = new Set<string>();

  /**
   * 主渲染方法：将数据对象转换为Konva节点
   */
  async createNode(data: CanvasObject, zoom = 1): Promise<Konva.Shape> {
    this.currentZoom = zoom;

    // 检查缓存
    const cacheKey = this.getCacheKey(data);
    if (this.config.useCache && this.nodeCache.has(cacheKey)) {
      return this.nodeCache.get(cacheKey)!.clone() as Konva.Shape;
    }

    // 根据类型创建节点
    let node: Konva.Shape;

    switch (data.type) {
      case "rectangle":
        node = this.createRectangle(data);
        break;
      case "ellipse":
        node = this.createEllipse(data);
        break;
      case "circle":
        node = this.createCircle(data);
        break;
      case "line":
        node = this.createLine(data);
        break;
      case "path":
        node = this.createPath(data);
        break;
      case "text":
        node = this.createText(data);
        break;
      case "image":
        node = await this.createImage(data);
        break;
      case "polygon":
        node = this.createPolygon(data);
        break;
      case "star":
        node = this.createStar(data);
        break;
      case "group":
        node = this.createGroup(data);
        break;
      default:
        throw new Error(`Unsupported object type: ${data.type}`);
    }

    // 应用通用样式和属性
    this.applyCommonProperties(node, data);

    // 缓存节点
    if (this.config.useCache) {
      this.nodeCache.set(cacheKey, node.clone() as Konva.Shape);
    }

    return node;
  }

  /**
   * 创建矩形节点
   */
  private createRectangle(data: CanvasObject): Konva.Rect {
    const rect = new Konva.Rect({
      x: data.position.x,
      y: data.position.y,
      width: data.size.x,
      height: data.size.y,
      cornerRadius: data.properties.cornerRadius || 0,
    });

    // LOD优化：缩放很小时显示简化版本
    if (this.shouldSimplify()) {
      rect.fill("#ccc"); // 简化颜色
      rect.strokeWidth(1);
    }

    return rect;
  }

  /**
   * 创建椭圆节点
   */
  private createEllipse(data: CanvasObject): Konva.Ellipse {
    return new Konva.Ellipse({
      x: data.position.x + data.size.x / 2,
      y: data.position.y + data.size.y / 2,
      radiusX: data.properties.radiusX || data.size.x / 2,
      radiusY: data.properties.radiusY || data.size.y / 2,
    });
  }

  /**
   * 创建圆形节点
   */
  private createCircle(data: CanvasObject): Konva.Circle {
    return new Konva.Circle({
      x: data.position.x,
      y: data.position.y,
      radius: data.properties.radius || Math.min(data.size.x, data.size.y) / 2,
    });
  }

  /**
   * 创建线条节点
   */
  private createLine(data: CanvasObject): Konva.Line {
    return new Konva.Line({
      points: data.properties.points || [],
      tension: data.properties.tension || 0,
      closed: data.properties.closed || false,
    });
  }

  /**
   * 创建路径节点（用于自由绘制）
   */
  private createPath(data: CanvasObject): Konva.Line {
    const line = new Konva.Line({
      points: data.properties.points || [],
      tension: 0.5, // 默认使用平滑曲线
      closed: false,
    });

    // 路径的特殊样式
    line.lineCap(data.style.lineCap || "round");
    line.lineJoin(data.style.lineJoin || "round");

    return line;
  }

  /**
   * 创建文本节点
   */
  private createText(data: CanvasObject): Konva.Text {
    const textConfig: any = {
      x: data.position.x,
      y: data.position.y,
      text: data.properties.text || "",
      fontSize: data.properties.fontSize || 16,
      fontFamily: data.properties.fontFamily || "Arial",
      fontStyle: data.properties.fontStyle || "normal",
      align: data.properties.align || "left",
    };

    // LOD优化：缩放很小时简化文本渲染
    if (this.shouldSimplify() && textConfig.text.length > 20) {
      textConfig.text = textConfig.text.substring(0, 20) + "...";
      textConfig.fontSize = Math.max(8, textConfig.fontSize * 0.7);
    }

    return new Konva.Text(textConfig);
  }

  /**
   * 创建图片节点（异步）
   */
  private async createImage(data: CanvasObject): Promise<Konva.Image> {
    let imageElement: HTMLImageElement;
    const imageUrl = data.properties.imageUrl;

    if (imageUrl) {
      // 检查缓存
      if (this.imageCache.has(imageUrl)) {
        imageElement = this.imageCache.get(imageUrl)!;
      } else {
        // 异步加载图片
        imageElement = await this.loadImage(imageUrl);
        this.imageCache.set(imageUrl, imageElement);
      }
    } else if (data.properties.imageElement) {
      imageElement = data.properties.imageElement;
    } else {
      throw new Error("Image object must have either imageUrl or imageElement");
    }

    return new Konva.Image({
      x: data.position.x,
      y: data.position.y,
      image: imageElement,
      width: data.size.x,
      height: data.size.y,
    });
  }

  /**
   * 创建多边形节点
   */
  private createPolygon(data: CanvasObject): Konva.Line {
    const sides = data.properties.sides || 5;
    const radius = Math.min(data.size.x, data.size.y) / 2;
    const points: number[] = [];

    // 生成多边形顶点
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      points.push(
        data.position.x + radius + radius * Math.cos(angle),
        data.position.y + radius + radius * Math.sin(angle)
      );
    }

    return new Konva.Line({
      points,
      closed: true,
    });
  }

  /**
   * 创建星形节点
   */
  private createStar(data: CanvasObject): Konva.Star {
    return new Konva.Star({
      x: data.position.x + data.size.x / 2,
      y: data.position.y + data.size.y / 2,
      numPoints: data.properties.sides || 5,
      innerRadius: data.properties.innerRadius || 20,
      outerRadius: Math.min(data.size.x, data.size.y) / 2,
    });
  }

  /**
   * 创建组节点（包含子节点）
   */
  private createGroup(data: CanvasObject): Konva.Group {
    const group = new Konva.Group({
      x: data.position.x,
      y: data.position.y,
      rotation: data.rotation,
      scaleX: data.scale.x,
      scaleY: data.scale.y,
    });

    // 注意：组的子节点需要单独渲染
    // 这里只是创建空的组容器

    return group;
  }

  /**
   * 应用通用属性和样式
   */
  private applyCommonProperties(node: Konva.Shape, data: CanvasObject): void {
    // 设置ID（用于查找和更新）
    node.id(data.id);

    // 应用样式
    if (data.style.fill) {
      node.fill(data.style.fill);
    }

    if (data.style.stroke) {
      node.stroke(data.style.stroke);
      node.strokeWidth(data.style.strokeWidth || 1);
    }

    if (data.style.opacity !== undefined) {
      node.opacity(data.style.opacity);
    }

    // 阴影效果
    if (data.style.shadowColor) {
      node.shadowColor(data.style.shadowColor);
      node.shadowBlur(data.style.shadowBlur || 5);
      node.shadowOffset(data.style.shadowOffset || { x: 0, y: 0 });
      node.shadowEnabled(true);
    }

    // 虚线样式
    if (data.style.dash) {
      node.dash(data.style.dash);
    }

    // 线帽和连接
    if (data.style.lineCap) {
      node.lineCap(data.style.lineCap);
    }
    if (data.style.lineJoin) {
      node.lineJoin(data.style.lineJoin);
    }

    // 变换
    node.rotation(data.rotation);
    node.scaleX(data.scale.x);
    node.scaleY(data.scale.y);

    // 可见性和交互
    node.visible(data.metadata.visible !== false);
    node.draggable(!data.metadata.locked);

    // 添加数据引用（便于调试）
    node.setAttr("data-object", data);
  }

  /**
   * 批量渲染对象到指定的Konva层
   */
  renderToLayer(
    objects: CanvasObject[],
    layer: Konva.Layer,
    viewport: { zoom: number; visibleBounds: any }
  ): void {
    const batch = layer.getBatchDraw();

    // 开始批量操作（如果启用）
    if (this.config.batchDraw) {
      layer.batchDrawStart();
    }

    // 获取当前可见的对象ID
    const visibleIds = new Set<string>();

    objects.forEach((obj) => {
      visibleIds.add(obj.id);

      // 检查对象是否已经在层中
      const existingNode = layer.findOne(`#${obj.id}`);

      if (existingNode) {
        // 更新现有节点
        this.updateNode(existingNode, obj, viewport.zoom);
      } else {
        // 创建新节点
        const node = this.createNode(obj, viewport.zoom);

        // 应用LOD优化
        this.applyLodOptimizations(node, viewport.zoom);

        // 添加到层
        layer.add(node);

        // 触发进入动画
        this.animateEntrance(node);
      }
    });

    // 移除不再可见的对象
    this.removeInvisibleObjects(layer, visibleIds);

    // 根据zIndex排序
    this.sortByZIndex(layer);

    // 结束批量操作
    if (this.config.batchDraw) {
      layer.batchDrawEnd();
    }

    // 更新可见对象集合
    this.visibleObjects = visibleIds;
  }

  /**
   * 更新现有节点
   */
  private updateNode(
    node: Konva.Shape,
    data: CanvasObject,
    zoom: number
  ): void {
    // 检查是否需要更新（根据版本号或修改时间）
    const existingData = node.getAttr("data-object");
    if (
      existingData &&
      existingData.metadata.updatedAt >= data.metadata.updatedAt
    ) {
      return; // 无需更新
    }

    // 更新位置和大小
    switch (data.type) {
      case "rectangle":
        (node as Konva.Rect).setAttrs({
          x: data.position.x,
          y: data.position.y,
          width: data.size.x,
          height: data.size.y,
          cornerRadius: data.properties.cornerRadius,
        });
        break;
      case "text":
        (node as Konva.Text).setAttrs({
          x: data.position.x,
          y: data.position.y,
          text: data.properties.text,
        });
        break;
      // ... 其他类型的更新逻辑
    }

    // 更新样式
    this.applyCommonProperties(node, data);

    // 更新LOD
    this.applyLodOptimizations(node, zoom);

    // 更新缓存的数据引用
    node.setAttr("data-object", data);
  }

  /**
   * 应用细节级别（LOD）优化
   */
  private applyLodOptimizations(node: Konva.Shape, zoom: number): void {
    if (!this.config.simplifyOnZoomOut) return;

    const lod = this.getLodLevel(zoom);

    switch (lod) {
      case "low":
        // 最低细节级别：简化渲染
        node.opacity(0.7);
        node.shadowEnabled(false);
        node.strokeWidth(Math.max(1, (node.strokeWidth() || 1) * 0.5));

        // 对复杂对象进行简化
        if (node instanceof Konva.Text) {
          const text = node as Konva.Text;
          if (text.fontSize() > 12) {
            text.fontSize(12);
          }
        }
        break;

      case "medium":
        // 中等细节级别：部分优化
        node.opacity(0.9);
        node.shadowBlur((node.shadowBlur() || 0) * 0.7);
        break;

      case "high":
        // 高细节级别：完整渲染
        const originalData = node.getAttr("data-object");
        if (originalData) {
          node.opacity(originalData.style.opacity || 1);
          node.shadowEnabled(!!originalData.style.shadowColor);
        }
        break;
    }
  }

  /**
   * 根据缩放级别获取LOD级别
   */
  private getLodLevel(zoom: number): "low" | "medium" | "high" {
    if (zoom < this.config.lodThresholds.low) return "low";
    if (zoom < this.config.lodThresholds.medium) return "medium";
    return "high";
  }

  /**
   * 判断是否需要简化渲染
   */
  private shouldSimplify(): boolean {
    return (
      this.config.simplifyOnZoomOut &&
      this.currentZoom < this.config.lodThresholds.low
    );
  }

  /**
   * 移除不可见的对象
   */
  private removeInvisibleObjects(
    layer: Konva.Layer,
    visibleIds: Set<string>
  ): void {
    layer.getChildren((node: Konva.Node) => {
      if (node.id() && !visibleIds.has(node.id())) {
        // 淡出动画
        this.animateExit(node as Konva.Shape, () => {
          node.remove();
        });
        return true;
      }
      return false;
    });
  }

  /**
   * 根据zIndex排序节点
   */
  private sortByZIndex(layer: Konva.Layer): void {
    const children = layer.getChildren();
    children.sort((a, b) => {
      const aData = a.getAttr("data-object");
      const bData = b.getAttr("data-object");

      const aZ = aData ? aData.zIndex : 0;
      const bZ = bData ? bData.zIndex : 0;

      return aZ - bZ;
    });

    // 重新设置children（保持顺序）
    children.forEach((child, index) => {
      child.setZIndex(index);
    });
  }

  /**
   * 进入动画
   */
  private animateEntrance(node: Konva.Shape): void {
    node.opacity(0);
    node.scale({ x: 0.8, y: 0.8 });

    new Konva.Tween({
      node,
      duration: 0.3,
      opacity: node.getAttr("data-object").style.opacity || 1,
      scaleX: 1,
      scaleY: 1,
      easing: Konva.Easings.EaseInOut,
    }).play();
  }

  /**
   * 退出动画
   */
  private animateExit(node: Konva.Shape, onComplete: () => void): void {
    new Konva.Tween({
      node,
      duration: 0.2,
      opacity: 0,
      scaleX: 0.8,
      scaleY: 0.8,
      easing: Konva.Easings.EaseIn,
      onFinish: onComplete,
    }).play();
  }

  /**
   * 异步加载图片
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(data: CanvasObject): string {
    return `${data.id}_v${data.metadata.version}_z${Math.floor(
      this.currentZoom * 10
    )}`;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.nodeCache.clear();
    this.imageCache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { nodes: number; images: number } {
    return {
      nodes: this.nodeCache.size,
      images: this.imageCache.size,
    };
  }
}
