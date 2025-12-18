// events/EventSystem.ts
/**
 * 事件处理系统 EventSystem - 处理复杂的用户交互，提供自然流畅的操作体验
 */
import Konva from "konva";
import {
  CanvasEventType,
  CanvasEventData,
  EventHandler,
  EventSystemConfig,
  GestureConfig,
} from "../types/event-system";

export class EventSystem {
  private stage: Konva.Stage;
  private worldGroup: Konva.Group;

  // 事件监听器
  private listeners: Map<CanvasEventType, EventHandler[]> = new Map();
  private globalListeners: EventHandler[] = [];

  // 配置
  private config: EventSystemConfig;

  // 状态管理
  private isDragging: boolean = false;
  private isPinching: boolean = false;
  private lastClickTime: number = 0;
  private lastClickPos: { x: number; y: number } | null = null;
  private lastTouchDistance: number = 0;
  private dragStartPos: { x: number; y: number } | null = null;
  private dragStartTime: number = 0;

  // 惯性滚动
  private inertiaVelocity: { x: number; y: number } = { x: 0, y: 0 };
  private inertiaAnimationId: number | null = null;

  // 节流控制
  private lastEventTime: Map<string, number> = new Map();

  constructor(
    stage: Konva.Stage,
    worldGroup: Konva.Group,
    config?: Partial<EventSystemConfig>
  ) {
    this.stage = stage;
    this.worldGroup = worldGroup;

    // 默认配置
    this.config = {
      capturePhase: false,
      passiveEvents: true,
      throttleEvents: true,
      throttleInterval: 16, // ~60fps
      batchEvents: true,
      gestures: {
        dragThreshold: 3,
        dragTimeThreshold: 100,
        pinchThreshold: 10,
        zoomSensitivity: 0.1,
        doubleTapInterval: 300,
        tapThreshold: 5,
        longPressDuration: 500,
        inertiaEnabled: true,
        inertiaDeceleration: 0.95,
        inertiaMaxSpeed: 50,
      },
      logEvents: false,
      ...config,
    };

    // 绑定原生事件
    this.bindNativeEvents();

    // 初始化事件类型监听器映射
    this.initializeEventTypes();
  }

  /**
   * 初始化所有支持的事件类型
   */
  private initializeEventTypes(): void {
    const eventTypes: CanvasEventType[] = [
      "click",
      "dblclick",
      "mousedown",
      "mouseup",
      "mousemove",
      "mouseenter",
      "mouseleave",
      "wheel",
      "dragstart",
      "dragmove",
      "dragend",
      "pinchstart",
      "pinchmove",
      "pinchend",
      "tap",
      "dbltap",
      "press",
      "pressup",
      "keydown",
      "keyup",
    ];

    eventTypes.forEach((type) => {
      this.listeners.set(type, []);
    });
  }

  /**
   * 绑定原生DOM事件
   */
  private bindNativeEvents(): void {
    const container = this.stage.container();

    // 鼠标事件
    container.addEventListener("mousedown", this.handleMouseDown.bind(this));
    container.addEventListener("mousemove", this.handleMouseMove.bind(this));
    container.addEventListener("mouseup", this.handleMouseUp.bind(this));
    container.addEventListener("wheel", this.handleWheel.bind(this), {
      passive: this.config.passiveEvents,
    });

    // 触摸事件
    container.addEventListener("touchstart", this.handleTouchStart.bind(this), {
      passive: this.config.passiveEvents,
    });
    container.addEventListener("touchmove", this.handleTouchMove.bind(this), {
      passive: this.config.passiveEvents,
    });
    container.addEventListener("touchend", this.handleTouchEnd.bind(this));

    // 键盘事件
    container.addEventListener("keydown", this.handleKeyDown.bind(this));
    container.addEventListener("keyup", this.handleKeyUp.bind(this));

    // 确保容器可聚焦
    container.setAttribute("tabindex", "0");
    container.style.outline = "none";

    // 防止默认行为
    container.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  /**
   * 处理鼠标按下事件
   */
  private handleMouseDown(event: MouseEvent): void {
    event.preventDefault();

    const screenPos = this.getEventPosition(event);
    const worldPos = this.screenToWorld(screenPos);

    // 记录拖拽开始信息
    this.dragStartPos = screenPos;
    this.dragStartTime = Date.now();
    this.isDragging = false;

    // 查找点击的目标对象
    const target = this.findEventTarget(worldPos);

    // 创建事件数据
    const eventData = this.createEventData(
      "mousedown",
      event,
      screenPos,
      worldPos,
      target
    );

    // 触发事件
    this.dispatchEvent(eventData);

    // 检查是否应该触发press事件（长按）
    this.checkForLongPress(eventData);
  }

  /**
   * 处理鼠标移动事件
   */
  private handleMouseMove(event: MouseEvent): void {
    if (this.shouldThrottle("mousemove")) return;

    const screenPos = this.getEventPosition(event);
    const worldPos = this.screenToWorld(screenPos);
    const target = this.findEventTarget(worldPos);

    // 创建事件数据
    const eventData = this.createEventData(
      "mousemove",
      event,
      screenPos,
      worldPos,
      target
    );

    // 检查是否开始拖拽
    if (this.dragStartPos && !this.isDragging) {
      const dx = screenPos.x - this.dragStartPos.x;
      const dy = screenPos.y - this.dragStartPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const time = Date.now() - this.dragStartTime;

      if (
        distance >= this.config.gestures.dragThreshold ||
        time >= this.config.gestures.dragTimeThreshold
      ) {
        // 触发拖拽开始
        this.isDragging = true;

        const dragStartEvent = this.createEventData(
          "dragstart",
          event,
          this.dragStartPos,
          this.screenToWorld(this.dragStartPos),
          target
        );

        this.dispatchEvent(dragStartEvent);
      }
    }

    // 如果是拖拽中，触发拖拽移动事件
    if (this.isDragging) {
      const dragEventData = this.createEventData(
        "dragmove",
        event,
        screenPos,
        worldPos,
        target,
        { x: event.movementX, y: event.movementY }
      );

      this.dispatchEvent(dragEventData);
    }

    // 触发普通移动事件
    this.dispatchEvent(eventData);
  }

  /**
   * 处理鼠标释放事件
   */
  private handleMouseUp(event: MouseEvent): void {
    const screenPos = this.getEventPosition(event);
    const worldPos = this.screenToWorld(screenPos);
    const target = this.findEventTarget(worldPos);

    // 创建事件数据
    const eventData = this.createEventData(
      "mouseup",
      event,
      screenPos,
      worldPos,
      target
    );

    // 如果正在拖拽，触发拖拽结束事件
    if (this.isDragging) {
      const dragEndEvent = this.createEventData(
        "dragend",
        event,
        screenPos,
        worldPos,
        target
      );
      this.dispatchEvent(dragEndEvent);
      this.isDragging = false;
    } else {
      // 检查是否点击
      this.checkForClick(event, screenPos, worldPos, target);
    }

    // 触发鼠标释放事件
    this.dispatchEvent(eventData);
    this.dragStartPos = null;
  }

  /**
   * 检查点击事件（包括单击和双击）
   */
  private checkForClick(
    event: MouseEvent,
    screenPos: { x: number; y: number },
    worldPos: { x: number; y: number },
    target: any
  ): void {
    const now = Date.now();

    // 检查是否在点击阈值内
    if (this.dragStartPos) {
      const dx = screenPos.x - this.dragStartPos.x;
      const dy = screenPos.y - this.dragStartPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.config.gestures.tapThreshold) {
        // 检查是否双击
        if (
          this.lastClickPos &&
          now - this.lastClickTime <= this.config.gestures.doubleTapInterval &&
          Math.abs(screenPos.x - this.lastClickPos.x) <=
            this.config.gestures.tapThreshold &&
          Math.abs(screenPos.y - this.lastClickPos.y) <=
            this.config.gestures.tapThreshold
        ) {
          // 触发双击事件
          const dblClickEvent = this.createEventData(
            "dblclick",
            event,
            screenPos,
            worldPos,
            target
          );
          this.dispatchEvent(dblClickEvent);

          // 同时触发单击事件（如果需要）
          const clickEvent = this.createEventData(
            "click",
            event,
            screenPos,
            worldPos,
            target
          );
          this.dispatchEvent(clickEvent);

          this.lastClickTime = 0;
          this.lastClickPos = null;
        } else {
          // 记录单击信息，等待可能的双击
          this.lastClickTime = now;
          this.lastClickPos = screenPos;

          // 延迟触发单击事件（等待可能的双击）
          setTimeout(() => {
            if (this.lastClickTime === now) {
              const clickEvent = this.createEventData(
                "click",
                event,
                screenPos,
                worldPos,
                target
              );
              this.dispatchEvent(clickEvent);
              this.lastClickTime = 0;
              this.lastClickPos = null;
            }
          }, this.config.gestures.doubleTapInterval);
        }
      }
    }
  }

  /**
   * 检查长按事件
   */
  private checkForLongPress(eventData: CanvasEventData): void {
    const pressTimer = setTimeout(() => {
      if (this.dragStartPos && !this.isDragging) {
        const pressEvent = { ...eventData, type: "press" as CanvasEventType };
        this.dispatchEvent(pressEvent);
      }
    }, this.config.gestures.longPressDuration);

    // 监听鼠标释放来取消长按
    const clearPressTimer = () => {
      clearTimeout(pressTimer);
      document.removeEventListener("mouseup", clearPressTimer);
      document.removeEventListener("mousemove", clearPressOnMove);
    };

    const clearPressOnMove = (e: MouseEvent) => {
      if (this.dragStartPos) {
        const screenPos = this.getEventPosition(e);
        const dx = screenPos.x - this.dragStartPos.x;
        const dy = screenPos.y - this.dragStartPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > this.config.gestures.tapThreshold) {
          clearPressTimer();
        }
      }
    };

    document.addEventListener("mouseup", clearPressTimer);
    document.addEventListener("mousemove", clearPressOnMove);
  }

  /**
   * 处理滚轮事件
   */
  private handleWheel(event: WheelEvent): void {
    event.preventDefault();

    const screenPos = this.getEventPosition(event);
    const worldPos = this.screenToWorld(screenPos);
    const target = this.findEventTarget(worldPos);

    // 创建事件数据
    const eventData = this.createEventData(
      "wheel",
      event,
      screenPos,
      worldPos,
      target,
      { wheelDelta: event.deltaY }
    );

    this.dispatchEvent(eventData);
  }

  /**
   * 处理触摸开始事件
   */
  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();

    if (event.touches.length === 1) {
      // 单指触摸，处理类似鼠标事件
      const touch = event.touches[0];
      const screenPos = this.getTouchPosition(touch);
      const worldPos = this.screenToWorld(screenPos);
      const target = this.findEventTarget(worldPos);

      this.dragStartPos = screenPos;
      this.dragStartTime = Date.now();

      const eventData = this.createEventData(
        "mousedown",
        event,
        screenPos,
        worldPos,
        target
      );

      this.dispatchEvent(eventData);
    } else if (event.touches.length === 2) {
      // 双指触摸，开始缩放手势
      this.isPinching = true;
      this.lastTouchDistance = this.getTouchDistance(event.touches);

      const centerPos = this.getTouchCenter(event.touches);
      const worldPos = this.screenToWorld(centerPos);

      const eventData = this.createEventData(
        "pinchstart",
        event,
        centerPos,
        worldPos,
        null
      );

      this.dispatchEvent(eventData);
    }
  }

  /**
   * 处理触摸移动事件
   */
  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (event.touches.length === 1 && !this.isPinching) {
      // 单指移动
      const touch = event.touches[0];
      const screenPos = this.getTouchPosition(touch);
      const worldPos = this.screenToWorld(screenPos);
      const target = this.findEventTarget(worldPos);

      const eventData = this.createEventData(
        "mousemove",
        event,
        screenPos,
        worldPos,
        target
      );

      this.dispatchEvent(eventData);
    } else if (event.touches.length === 2 && this.isPinching) {
      // 双指缩放
      const currentDistance = this.getTouchDistance(event.touches);
      const centerPos = this.getTouchCenter(event.touches);
      const worldPos = this.screenToWorld(centerPos);

      // 计算缩放比例
      const scaleDelta =
        (currentDistance - this.lastTouchDistance) *
        this.config.gestures.zoomSensitivity;
      this.lastTouchDistance = currentDistance;

      const eventData = this.createEventData(
        "pinchmove",
        event,
        centerPos,
        worldPos,
        null,
        { wheelDelta: scaleDelta }
      );

      this.dispatchEvent(eventData);
    }
  }

  /**
   * 处理触摸结束事件
   */
  private handleTouchEnd(event: TouchEvent): void {
    if (this.isPinching && event.touches.length < 2) {
      // 缩放手势结束
      this.isPinching = false;

      const eventData = this.createEventData(
        "pinchend",
        event,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        null
      );

      this.dispatchEvent(eventData);
    } else if (event.touches.length === 0) {
      // 所有触摸结束
      this.dragStartPos = null;
      this.isDragging = false;
    }
  }

  /**
   * 处理键盘按下事件
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const eventData = this.createEventData(
      "keydown",
      event,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      null,
      { keys: [event.key] }
    );

    this.dispatchEvent(eventData);
  }

  /**
   * 处理键盘释放事件
   */
  private handleKeyUp(event: KeyboardEvent): void {
    const eventData = this.createEventData(
      "keyup",
      event,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      null,
      { keys: [event.key] }
    );

    this.dispatchEvent(eventData);
  }

  /**
   * 获取事件位置
   */
  private getEventPosition(event: MouseEvent): { x: number; y: number } {
    const rect = this.stage.container().getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  /**
   * 获取触摸位置
   */
  private getTouchPosition(touch: Touch): { x: number; y: number } {
    const rect = this.stage.container().getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }

  /**
   * 获取触摸点距离
   */
  private getTouchDistance(touches: TouchList): number {
    const touch1 = touches[0];
    const touch2 = touches[1];

    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 获取触摸中心点
   */
  private getTouchCenter(touches: TouchList): { x: number; y: number } {
    const touch1 = touches[0];
    const touch2 = touches[1];

    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };
  }

  /**
   * 屏幕坐标转世界坐标
   */
  private screenToWorld(screenPos: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    const worldGroupPos = this.worldGroup.position();
    const worldGroupScale = this.worldGroup.scaleX(); // 假设等比例缩放

    return {
      x: (screenPos.x - worldGroupPos.x) / worldGroupScale,
      y: (screenPos.y - worldGroupPos.y) / worldGroupScale,
    };
  }

  /**
   * 查找事件目标对象
   * 在世界坐标系中查找被点击的对象
   */
  private findEventTarget(worldPos: { x: number; y: number }): any {
    // 这里需要实现对象拾取算法
    // 简化实现：遍历所有对象检查是否包含点

    // 实际实现应该使用空间索引（如四叉树）来优化查找
    return null;
  }

  /**
   * 创建事件数据对象
   */
  private createEventData(
    type: CanvasEventType,
    originalEvent: Event,
    screenPos: { x: number; y: number },
    worldPos: { x: number; y: number },
    target: any,
    extraData?: any
  ): CanvasEventData {
    let prevented = false;
    let propagated = true;

    return {
      type,
      target,
      worldPos,
      screenPos,
      originalEvent,
      ...extraData,
      preventDefault: () => {
        originalEvent.preventDefault();
        prevented = true;
      },
      stopPropagation: () => {
        propagated = false;
      },
    };
  }

  /**
   * 分发事件
   */
  private dispatchEvent(eventData: CanvasEventData): void {
    if (this.config.logEvents) {
      console.log(`[EventSystem] ${eventData.type}`, eventData);
    }

    // 调用全局监听器
    this.globalListeners.forEach((handler) => {
      if (typeof handler === "function") {
        handler(eventData);
      }
    });

    // 调用特定事件类型的监听器
    const handlers = this.listeners.get(eventData.type);
    if (handlers) {
      // 按优先级排序
      const sortedHandlers = [...handlers].sort(
        (a, b) => (b.priority || 0) - (a.priority || 0)
      );

      for (const handler of sortedHandlers) {
        if (typeof handler === "function") {
          handler(eventData);

          // 如果是一次性监听器，移除
          if (handler.once) {
            this.off(eventData.type, handler);
          }
        }
      }
    }
  }

  /**
   * 检查是否需要节流事件
   */
  private shouldThrottle(eventType: string): boolean {
    if (!this.config.throttleEvents) return false;

    const now = Date.now();
    const lastTime = this.lastEventTime.get(eventType) || 0;

    if (now - lastTime < this.config.throttleInterval) {
      return true;
    }

    this.lastEventTime.set(eventType, now);
    return false;
  }

  /**
   * 启用惯性滚动
   */
  enableInertia(velocityX: number, velocityY: number): void {
    if (!this.config.gestures.inertiaEnabled) return;

    // 限制最大速度
    const maxSpeed = this.config.gestures.inertiaMaxSpeed;
    this.inertiaVelocity = {
      x: Math.max(-maxSpeed, Math.min(maxSpeed, velocityX)),
      y: Math.max(-maxSpeed, Math.min(maxSpeed, velocityY)),
    };

    // 停止现有的惯性动画
    if (this.inertiaAnimationId) {
      cancelAnimationFrame(this.inertiaAnimationId);
    }

    // 开始惯性动画
    const animateInertia = () => {
      // 应用减速度
      this.inertiaVelocity.x *= this.config.gestures.inertiaDeceleration;
      this.inertiaVelocity.y *= this.config.gestures.inertiaDeceleration;

      // 应用移动
      if (
        Math.abs(this.inertiaVelocity.x) > 0.1 ||
        Math.abs(this.inertiaVelocity.y) > 0.1
      ) {
        const currentPos = this.worldGroup.position();
        this.worldGroup.position({
          x: currentPos.x + this.inertiaVelocity.x,
          y: currentPos.y + this.inertiaVelocity.y,
        });

        this.inertiaAnimationId = requestAnimationFrame(animateInertia);
      } else {
        // 惯性结束
        this.inertiaVelocity = { x: 0, y: 0 };
        this.inertiaAnimationId = null;
      }
    };

    this.inertiaAnimationId = requestAnimationFrame(animateInertia);
  }

  /**
   * 注册事件监听器
   */
  on(eventType: CanvasEventType, handler: EventHandler): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.push(handler);
    }
  }

  /**
   * 注册全局事件监听器
   */
  onAny(handler: EventHandler): void {
    this.globalListeners.push(handler);
  }

  /**
   * 注册一次性事件监听器
   */
  once(eventType: CanvasEventType, handler: EventHandler): void {
    handler.once = true;
    this.on(eventType, handler);
  }

  /**
   * 移除事件监听器
   */
  off(eventType: CanvasEventType, handler: EventHandler): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }

    // 从全局监听器中移除
    const globalIndex = this.globalListeners.indexOf(handler);
    if (globalIndex > -1) {
      this.globalListeners.splice(globalIndex, 1);
    }
  }

  /**
   * 触发自定义事件
   */
  trigger(eventType: CanvasEventType, data?: any): void {
    const eventData = this.createEventData(
      eventType,
      new CustomEvent(eventType),
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      null,
      data
    );

    this.dispatchEvent(eventData);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<EventSystemConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): EventSystemConfig {
    return { ...this.config };
  }

  /**
   * 清理资源
   */
  destroy(): void {
    const container = this.stage.container();

    // 移除事件监听器
    container.removeEventListener("mousedown", this.handleMouseDown.bind(this));
    container.removeEventListener("mousemove", this.handleMouseMove.bind(this));
    container.removeEventListener("mouseup", this.handleMouseUp.bind(this));
    container.removeEventListener("wheel", this.handleWheel.bind(this));
    container.removeEventListener(
      "touchstart",
      this.handleTouchStart.bind(this)
    );
    container.removeEventListener("touchmove", this.handleTouchMove.bind(this));
    container.removeEventListener("touchend", this.handleTouchEnd.bind(this));
    container.removeEventListener("keydown", this.handleKeyDown.bind(this));
    container.removeEventListener("keyup", this.handleKeyUp.bind(this));

    // 停止惯性动画
    if (this.inertiaAnimationId) {
      cancelAnimationFrame(this.inertiaAnimationId);
    }

    // 清空监听器
    this.listeners.clear();
    this.globalListeners = [];
  }
}
