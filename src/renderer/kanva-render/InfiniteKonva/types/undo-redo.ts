/**
 * 操作类型
 */
export type OperationType =
  | "create-object" // 创建对象
  | "update-object" // 更新对象
  | "delete-object" // 删除对象
  | "move-object" // 移动对象
  | "resize-object" // 调整大小
  | "rotate-object" // 旋转对象
  | "group-objects" // 组合对象
  | "ungroup-objects" // 取消组合
  | "change-style" // 修改样式
  | "change-zindex" // 修改层级
  | "batch" // 批量操作
  | "viewport-change" // 视口变化
  | "canvas-clear"; // 清空画布

/**
 * 操作状态
 */
export type OperationStatus = "pending" | "applied" | "undone" | "redone";

/**
 * 操作记录
 */
export interface OperationRecord {
  id: string; // 操作ID
  type: OperationType; // 操作类型
  timestamp: number; // 时间戳
  author?: string; // 操作者
  sessionId?: string; // 会话ID

  // 操作目标
  targetIds: string[]; // 目标对象ID数组
  targetData?: any; // 目标数据（如对象类型等）

  // 操作数据
  data: any; // 操作数据（新状态）
  previousData?: any; // 之前的数据（旧状态）
  inverseData?: any; // 逆操作数据（用于撤销）

  // 元数据
  metadata: {
    version: number; // 版本号
    description?: string; // 操作描述
    tags?: string[]; // 标签
    source: "user" | "program" | "sync"; // 操作来源
    selection?: string[]; // 操作时的选中状态
    viewport?: any; // 操作时的视口状态
  };

  // 状态
  status: OperationStatus;
  appliedAt?: number; // 应用时间
  undoneAt?: number; // 撤销时间
  redoneAt?: number; // 重做时间

  // 关系
  parentId?: string; // 父操作ID（用于批量操作）
  childrenIds?: string[]; // 子操作ID
}

/**
 * 批量操作组
 */
export interface BatchOperation {
  id: string;
  name?: string;
  operations: OperationRecord[];
  startTime: number;
  endTime?: number;
  description?: string;
}

/**
 * 撤销/重做管理器配置
 */
export interface UndoRedoConfig {
  enabled: boolean; // 是否启用
  maxHistorySize: number; // 最大历史记录数
  compressHistory: boolean; // 是否压缩历史
  groupSimilarOps: boolean; // 是否合并相似操作
  groupTimeout: number; // 操作分组超时时间（毫秒）

  // 性能优化
  throttleOperations: boolean; // 是否节流操作记录
  throttleInterval: number; // 节流间隔
  useCompression: boolean; // 是否使用数据压缩
  memoryLimit: number; // 内存限制（字节）

  // 序列化配置
  serializeFunctions: boolean; // 是否序列化函数
  deepCloneData: boolean; // 是否深拷贝数据

  // 调试
  logOperations: boolean; // 是否记录操作日志
  trackPerformance: boolean; // 是否跟踪性能
}

/**
 * 撤销/重做状态
 */
export interface UndoRedoState {
  canUndo: boolean;
  canRedo: boolean;
  currentIndex: number;
  historySize: number;
  memoryUsage: number;
  lastOperation?: OperationRecord;
}

/**
 * 操作分组规则
 */
export interface OperationGroupingRule {
  name: string;
  predicate: (op1: OperationRecord, op2: OperationRecord) => boolean;
  merge: (op1: OperationRecord, op2: OperationRecord) => OperationRecord;
  maxGroupSize?: number;
  timeout?: number;
}
