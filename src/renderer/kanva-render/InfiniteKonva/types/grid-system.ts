// types/grid-system.ts
/**
 * 网格配置
 */
export interface GridConfig {
  enabled: boolean; // 是否启用网格
  size: number; // 基础网格大小（世界单位）
  color: string; // 网格线颜色
  opacity: number; // 不透明度
  lineWidth: number; // 线宽

  // 多级网格
  levels: GridLevel[]; // 网格级别配置
  showMajorGrid: boolean; // 是否显示主网格
  showMinorGrid: boolean; // 是否显示次网格

  // 样式
  dashEnabled: boolean; // 是否使用虚线
  dashPattern: number[]; // 虚线模式
  snapEnabled: boolean; // 是否启用对齐
  snapThreshold: number; // 对齐阈值（像素）

  // 性能
  renderQuality: "low" | "medium" | "high"; // 渲染质量
  updateDebounce: number; // 更新防抖时间（毫秒）
}

/**
 * 网格级别
 */
export interface GridLevel {
  size: number; // 网格大小
  color: string; // 颜色
  opacity: number; // 不透明度
  lineWidth: number; // 线宽
  visibleZoomRange: [number, number]; // 可见的缩放范围
  dashPattern?: number[]; // 虚线模式
}

/**
 * 网格渲染状态
 */
export interface GridRenderState {
  visibleBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  zoom: number;
  viewportOffset: { x: number; y: number };
  activeLevels: GridLevel[];
  renderTime: number;
}

/**
 * 对齐信息
 */
export interface SnapInfo {
  snapped: boolean; // 是否对齐成功
  target: { x: number; y: number }; // 对齐到的网格点
  distance: number; // 对齐距离
  direction: "horizontal" | "vertical" | "both";
}
