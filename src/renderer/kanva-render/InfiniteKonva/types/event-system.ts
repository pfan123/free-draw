// types/event-system.ts
/**
 * 事件类型
 */
export type CanvasEventType =
  | "click"
  | "dblclick"
  | "mousedown"
  | "mouseup"
  | "mousemove"
  | "mouseenter"
  | "mouseleave"
  | "wheel"
  | "dragstart"
  | "dragmove"
  | "dragend"
  | "pinchstart"
  | "pinchmove"
  | "pinchend"
  | "tap"
  | "dbltap"
  | "press"
  | "pressup"
  | "keydown"
  | "keyup";

/**
 * 事件数据
 */
export interface CanvasEventData {
  type: CanvasEventType;
  target: any; // 事件目标对象
  worldPos: { x: number; y: number }; // 世界坐标
  screenPos: { x: number; y: number }; // 屏幕坐标
  originalEvent: MouseEvent | WheelEvent | TouchEvent | KeyboardEvent;
  preventDefault: () => void;
  stopPropagation: () => void;

  // 特定事件附加数据
  delta?: { x: number; y: number }; // 拖拽/移动增量
  wheelDelta?: number; // 滚轮增量
  keys?: string[]; // 按下的键
  touches?: Touch[]; // 触摸点
}

/**
 * 手势识别配置
 */
export interface GestureConfig {
  // 拖拽
  dragThreshold: number; // 拖拽触发阈值（像素）
  dragTimeThreshold: number; // 拖拽时间阈值（毫秒）

  // 缩放
  pinchThreshold: number; // 缩放手势阈值
  zoomSensitivity: number; // 缩放灵敏度

  // 双击
  doubleTapInterval: number; // 双击间隔时间（毫秒）
  tapThreshold: number; // 点击阈值（像素）

  // 长按
  longPressDuration: number; // 长按持续时间（毫秒）

  // 惯性滚动
  inertiaEnabled: boolean; // 是否启用惯性
  inertiaDeceleration: number; // 惯性减速度
  inertiaMaxSpeed: number; // 最大惯性速度
}

/**
 * 事件处理器
 */
export interface EventHandler {
  (event: CanvasEventData): void;
  priority?: number; // 优先级，数字越大越先执行
  once?: boolean; // 是否只执行一次
}

/**
 * 事件管理器配置
 */
export interface EventSystemConfig {
  // 通用配置
  capturePhase: boolean; // 是否使用捕获阶段
  passiveEvents: boolean; // 是否使用被动事件

  // 性能优化
  throttleEvents: boolean; // 是否节流事件
  throttleInterval: number; // 节流间隔（毫秒）
  batchEvents: boolean; // 是否批量处理事件

  // 手势配置
  gestures: GestureConfig;

  // 调试
  logEvents: boolean; // 是否记录事件日志
}
