// src/utils/UndoRedoManager.ts
import {
  OperationRecord,
  OperationType,
  BatchOperation,
  UndoRedoConfig,
  UndoRedoState,
  OperationGroupingRule,
} from "../types/undo-redo";
import { CanvasObject, CanvasObjectUpdate } from "../types/canvas-object";
import { MemoryManager } from "../performance/MemoryManager";

/**
 * 撤销/重做管理器
 * 负责记录、管理和执行所有画布操作
 */
export class UndoRedoManager {
  private config: UndoRedoConfig;
  private memoryManager: MemoryManager;

  // 历史记录
  private history: OperationRecord[] = [];
  private currentIndex: number = -1;
  private batchStack: BatchOperation[] = [];
  private currentBatch: BatchOperation | null = null;

  // 分组管理
  private groupingRules: OperationGroupingRule[] = [];
  private pendingGroup: Map<string, OperationRecord[]> = new Map();
  private groupTimers: Map<string, number> = new Map();

  // 状态缓存
  private stateCache: Map<string, any> = new Map();
  private objectSnapshots: Map<string, CanvasObject> = new Map();

  // 事件监听
  private listeners: Map<string, Function[]> = new Map();

  // 性能监控
  private performanceStats = {
    totalOperations: 0,
    undoCount: 0,
    redoCount: 0,
    averageUndoTime: 0,
    averageRedoTime: 0,
    memoryUsage: 0,
  };

  constructor(config?: Partial<UndoRedoConfig>) {
    this.config = {
      enabled: true,
      maxHistorySize: 1000,
      compressHistory: true,
      groupSimilarOps: true,
      groupTimeout: 1000, // 1秒
      throttleOperations: true,
      throttleInterval: 100, // 100ms
      useCompression: false,
      memoryLimit: 50 * 1024 * 1024, // 50MB
      serializeFunctions: false,
      deepCloneData: true,
      logOperations: false,
      trackPerformance: true,
      ...config,
    };

    this.memoryManager = new MemoryManager({
      maxMemoryUsage: this.config.memoryLimit,
      warningThreshold: 0.8,
    });

    // 初始化分组规则
    this.setupGroupingRules();

    // 启动内存监控
    this.startMemoryMonitoring();
  }

  /**
   * 设置操作分组规则
   */
  private setupGroupingRules(): void {
    // 1. 连续移动分组
    this.groupingRules.push({
      name: "continuous-move",
      predicate: (op1, op2) => {
        return (
          op1.type === "move-object" &&
          op2.type === "move-object" &&
          op1.targetIds.length === 1 &&
          op2.targetIds.length === 1 &&
          op1.targetIds[0] === op2.targetIds[0] &&
          Math.abs(op1.timestamp - op2.timestamp) < this.config.groupTimeout
        );
      },
      merge: (op1, op2) => {
        // 合并移动操作，只保留最终位置
        return {
          ...op2,
          previousData: op1.previousData, // 保留最初位置
          metadata: {
            ...op2.metadata,
            description: `移动对象 ${op1.targetIds[0]}`,
            merged: true,
            mergeCount: (op1.metadata.mergeCount || 1) + 1,
          },
        };
      },
      maxGroupSize: 10,
      timeout: this.config.groupTimeout,
    });

    // 2. 连续样式修改分组
    this.groupingRules.push({
      name: "continuous-style",
      predicate: (op1, op2) => {
        return (
          op1.type === "change-style" &&
          op2.type === "change-style" &&
          op1.targetIds.length === 1 &&
          op2.targetIds.length === 1 &&
          op1.targetIds[0] === op2.targetIds[0] &&
          Math.abs(op1.timestamp - op2.timestamp) < this.config.groupTimeout
        );
      },
      merge: (op1, op2) => {
        // 合并样式修改，只保留最终样式
        return {
          ...op2,
          previousData: op1.previousData,
          metadata: {
            ...op2.metadata,
            description: `修改对象样式 ${op1.targetIds[0]}`,
            merged: true,
          },
        };
      },
      timeout: this.config.groupTimeout,
    });

    // 3. 批量选择操作分组
    this.groupingRules.push({
      name: "batch-selection",
      predicate: (op1, op2) => {
        return (
          op1.type === op2.type &&
          op1.type.includes("object") &&
          JSON.stringify(op1.metadata.selection) ===
            JSON.stringify(op2.metadata.selection) &&
          Math.abs(op1.timestamp - op2.timestamp) < 500
        );
      },
      merge: (op1, op2) => {
        // 创建批量操作
        const batchId = `batch_${Date.now()}`;

        return {
          id: batchId,
          type: "batch",
          timestamp: op2.timestamp,
          targetIds: [...new Set([...op1.targetIds, ...op2.targetIds])],
          data: {
            operations: [op1, op2],
            name: `批量${this.getOperationName(op1.type)}`,
          },
          previousData: {
            operations: [op1.previousData, op2.previousData],
          },
          metadata: {
            ...op2.metadata,
            description: `批量操作 (${
              op1.targetIds.length + op2.targetIds.length
            }个对象)`,
            batch: true,
            operationCount: 2,
          },
          status: "applied",
        };
      },
    });
  }

  /**
   * 记录操作（核心方法）
   */
  recordOperation(
    type: OperationType,
    targetIds: string[],
    data: any,
    previousData?: any,
    metadata?: Partial<OperationRecord["metadata"]>
  ): OperationRecord {
    if (!this.config.enabled) {
      return this.createEmptyRecord();
    }

    const record: OperationRecord = {
      id: this.generateOperationId(),
      type,
      timestamp: Date.now(),
      targetIds,
      data: this.prepareData(data),
      previousData: this.prepareData(previousData),
      metadata: {
        version: 1,
        source: "user",
        description: this.generateDescription(type, targetIds, data),
        ...metadata,
      },
      status: "applied",
      appliedAt: Date.now(),
    };

    // 设置逆操作数据
    record.inverseData = this.calculateInverseData(record);

    // 检查是否可以分组
    if (this.config.groupSimilarOps && this.currentIndex >= 0) {
      const lastRecord = this.history[this.currentIndex];
      const grouped = this.tryGroupOperations(lastRecord, record);

      if (grouped) {
        // 替换最后一个记录
        this.history[this.currentIndex] = grouped;
        this.emit("operation-grouped", { old: lastRecord, new: grouped });
        return grouped;
      }
    }

    // 添加到历史记录
    this.addToHistory(record);

    // 触发事件
    this.emit("operation-recorded", record);

    if (this.config.logOperations) {
      this.logOperation(record);
    }

    return record;
  }

  /**
   * 添加对象创建操作
   */
  recordCreateObject(object: CanvasObject): OperationRecord {
    return this.recordOperation(
      "create-object",
      [object.id],
      object,
      undefined,
      {
        description: `创建${this.getObjectTypeName(object.type)}`,
        tags: ["create", object.type],
      }
    );
  }

  /**
   * 添加对象更新操作
   */
  recordUpdateObject(
    objectId: string,
    newData: Partial<CanvasObject>,
    oldData: CanvasObject
  ): OperationRecord {
    // 检测具体操作类型
    const operationType = this.detectUpdateType(oldData, newData);

    return this.recordOperation(operationType, [objectId], newData, oldData, {
      description: this.getUpdateDescription(operationType, objectId, newData),
      tags: ["update", operationType],
    });
  }

  /**
   * 添加对象删除操作
   */
  recordDeleteObject(object: CanvasObject): OperationRecord {
    return this.recordOperation("delete-object", [object.id], null, object, {
      description: `删除${this.getObjectTypeName(object.type)}`,
      tags: ["delete", object.type],
    });
  }

  /**
   * 添加批量操作
   */
  recordBatchOperation(
    operations: OperationRecord[],
    name?: string
  ): OperationRecord {
    const batchRecord: OperationRecord = {
      id: this.generateOperationId(),
      type: "batch",
      timestamp: Date.now(),
      targetIds: operations.flatMap((op) => op.targetIds),
      data: {
        operations,
        name: name || `批量操作 (${operations.length}个操作)`,
      },
      previousData: {
        operations: operations.map((op) => op.previousData),
      },
      metadata: {
        version: 1,
        source: "user",
        description: name || `批量操作 (${operations.length}个操作)`,
        batch: true,
        operationCount: operations.length,
      },
      status: "applied",
      appliedAt: Date.now(),
    };

    batchRecord.inverseData = this.calculateInverseData(batchRecord);

    this.addToHistory(batchRecord);

    return batchRecord;
  }

  /**
   * 开始批量操作记录
   */
  beginBatch(name?: string): void {
    if (this.currentBatch) {
      console.warn("Batch already in progress");
      return;
    }

    this.currentBatch = {
      id: `batch_${Date.now()}`,
      name,
      operations: [],
      startTime: Date.now(),
    };

    this.batchStack.push(this.currentBatch);

    this.emit("batch-begin", this.currentBatch);
  }

  /**
   * 结束批量操作记录
   */
  endBatch(): OperationRecord | null {
    if (!this.currentBatch || this.batchStack.length === 0) {
      return null;
    }

    const batch = this.batchStack.pop()!;
    batch.endTime = Date.now();

    // 更新当前批次
    this.currentBatch = this.batchStack[this.batchStack.length - 1] || null;

    if (batch.operations.length > 0) {
      // 只有有操作时才记录
      const batchRecord = this.recordBatchOperation(
        batch.operations,
        batch.name
      );

      this.emit("batch-end", { batch, record: batchRecord });
      return batchRecord;
    }

    this.emit("batch-end", { batch, record: null });
    return null;
  }

  /**
   * 撤销操作
   */
  async undo(): Promise<OperationRecord | null> {
    if (!this.canUndo()) {
      return null;
    }

    const startTime = performance.now();

    try {
      const record = this.history[this.currentIndex];

      // 检查是否为批量操作
      if (record.type === "batch") {
        await this.undoBatchOperation(record);
      } else {
        await this.undoSingleOperation(record);
      }

      // 更新状态
      record.status = "undone";
      record.undoneAt = Date.now();
      this.currentIndex--;

      // 更新性能统计
      const undoTime = performance.now() - startTime;
      this.updatePerformanceStats("undo", undoTime);

      // 触发事件
      this.emit("operation-undone", record);

      if (this.config.logOperations) {
        console.log(`Undo: ${record.metadata.description}`, record);
      }

      return record;
    } catch (error) {
      console.error("Undo failed:", error);
      this.emit("undo-error", { error, timestamp: Date.now() });
      return null;
    }
  }

  /**
   * 重做操作
   */
  async redo(): Promise<OperationRecord | null> {
    if (!this.canRedo()) {
      return null;
    }

    const startTime = performance.now();

    try {
      const nextIndex = this.currentIndex + 1;
      const record = this.history[nextIndex];

      // 检查是否为批量操作
      if (record.type === "batch") {
        await this.redoBatchOperation(record);
      } else {
        await this.redoSingleOperation(record);
      }

      // 更新状态
      record.status = "redone";
      record.redoneAt = Date.now();
      this.currentIndex = nextIndex;

      // 更新性能统计
      const redoTime = performance.now() - startTime;
      this.updatePerformanceStats("redo", redoTime);

      // 触发事件
      this.emit("operation-redone", record);

      if (this.config.logOperations) {
        console.log(`Redo: ${record.metadata.description}`, record);
      }

      return record;
    } catch (error) {
      console.error("Redo failed:", error);
      this.emit("redo-error", { error, timestamp: Date.now() });
      return null;
    }
  }

  /**
   * 撤销单个操作
   */
  private async undoSingleOperation(record: OperationRecord): Promise<void> {
    switch (record.type) {
      case "create-object":
        // 创建操作的撤销 = 删除对象
        await this.executeDelete(record.targetIds[0], record.previousData);
        break;

      case "update-object":
      case "move-object":
      case "resize-object":
      case "rotate-object":
      case "change-style":
        // 更新操作的撤销 = 恢复旧状态
        await this.executeUpdate(record.targetIds[0], record.previousData);
        break;

      case "delete-object":
        // 删除操作的撤销 = 重新创建对象
        await this.executeCreate(record.previousData);
        break;

      case "group-objects":
        // 分组的撤销 = 取消分组
        await this.executeUngroup(record.targetIds, record.previousData);
        break;

      case "ungroup-objects":
        // 取消分组的撤销 = 重新分组
        await this.executeGroup(record.targetIds, record.previousData);
        break;

      case "change-zindex":
        // 层级修改的撤销 = 恢复旧层级
        await this.executeZIndexChange(
          record.targetIds[0],
          record.previousData
        );
        break;

      case "viewport-change":
        // 视口变化的撤销 = 恢复旧视口
        await this.executeViewportChange(record.previousData);
        break;

      case "canvas-clear":
        // 清空画布的撤销 = 恢复所有对象
        await this.executeCanvasRestore(record.previousData);
        break;
    }
  }

  /**
   * 重做单个操作
   */
  private async redoSingleOperation(record: OperationRecord): Promise<void> {
    switch (record.type) {
      case "create-object":
        await this.executeCreate(record.data);
        break;

      case "update-object":
      case "move-object":
      case "resize-object":
      case "rotate-object":
      case "change-style":
        await this.executeUpdate(record.targetIds[0], record.data);
        break;

      case "delete-object":
        await this.executeDelete(record.targetIds[0], record.data);
        break;

      case "group-objects":
        await this.executeGroup(record.targetIds, record.data);
        break;

      case "ungroup-objects":
        await this.executeUngroup(record.targetIds, record.data);
        break;

      case "change-zindex":
        await this.executeZIndexChange(record.targetIds[0], record.data);
        break;

      case "viewport-change":
        await this.executeViewportChange(record.data);
        break;

      case "canvas-clear":
        await this.executeCanvasClear(record.data);
        break;
    }
  }

  /**
   * 撤销批量操作
   */
  private async undoBatchOperation(record: OperationRecord): Promise<void> {
    const operations = record.data.operations as OperationRecord[];

    // 逆序撤销批量中的每个操作
    for (let i = operations.length - 1; i >= 0; i--) {
      const op = operations[i];
      await this.undoSingleOperation(op);
    }
  }

  /**
   * 重做批量操作
   */
  private async redoBatchOperation(record: OperationRecord): Promise<void> {
    const operations = record.data.operations as OperationRecord[];

    // 顺序重做批量中的每个操作
    for (const op of operations) {
      await this.redoSingleOperation(op);
    }
  }

  /**
   * 执行具体操作的方法
   */
  private async executeCreate(object: CanvasObject): Promise<void> {
    this.emit("execute-create", { object });
    // 实际创建逻辑由上层实现
  }

  private async executeUpdate(objectId: string, data: any): Promise<void> {
    this.emit("execute-update", { objectId, data });
    // 实际更新逻辑由上层实现
  }

  private async executeDelete(objectId: string, data: any): Promise<void> {
    this.emit("execute-delete", { objectId, data });
    // 实际删除逻辑由上层实现
  }

  private async executeGroup(objectIds: string[], data: any): Promise<void> {
    this.emit("execute-group", { objectIds, data });
    // 实际分组逻辑由上层实现
  }

  private async executeUngroup(objectIds: string[], data: any): Promise<void> {
    this.emit("execute-ungroup", { objectIds, data });
    // 实际取消分组逻辑由上层实现
  }

  private async executeZIndexChange(
    objectId: string,
    data: any
  ): Promise<void> {
    this.emit("execute-zindex-change", { objectId, data });
    // 实际层级修改逻辑由上层实现
  }

  private async executeViewportChange(viewport: any): Promise<void> {
    this.emit("execute-viewport-change", { viewport });
    // 实际视口修改逻辑由上层实现
  }

  private async executeCanvasClear(data: any): Promise<void> {
    this.emit("execute-canvas-clear", { data });
    // 实际清空画布逻辑由上层实现
  }

  private async executeCanvasRestore(data: any): Promise<void> {
    this.emit("execute-canvas-restore", { data });
    // 实际恢复画布逻辑由上层实现
  }

  /**
   * 添加到历史记录
   */
  private addToHistory(record: OperationRecord): void {
    // 移除当前索引之后的所有记录（如果撤销后进行了新操作）
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // 添加到历史
    this.history.push(record);
    this.currentIndex = this.history.length - 1;

    // 压缩历史记录（如果需要）
    if (this.config.compressHistory) {
      this.compressHistory();
    }

    // 限制历史记录大小
    if (this.history.length > this.config.maxHistorySize) {
      this.history = this.history.slice(-this.config.maxHistorySize);
      this.currentIndex = this.history.length - 1;
    }

    // 更新内存使用
    this.updateMemoryUsage();

    // 触发历史变化事件
    this.emit("history-changed", this.getState());
  }

  /**
   * 压缩历史记录
   */
  private compressHistory(): void {
    if (this.history.length < 2) return;

    const compressed: OperationRecord[] = [];
    let i = 0;

    while (i < this.history.length) {
      const current = this.history[i];

      // 检查是否可以与下一个操作合并
      if (i < this.history.length - 1) {
        const next = this.history[i + 1];
        const canCompress = this.canCompressOperations(current, next);

        if (canCompress) {
          // 合并操作
          const compressedOp = this.compressOperations(current, next);
          compressed.push(compressedOp);
          i += 2;
          continue;
        }
      }

      compressed.push(current);
      i++;
    }

    // 更新历史记录
    if (compressed.length < this.history.length) {
      const compressionRatio =
        (this.history.length - compressed.length) / this.history.length;
      this.history = compressed;
      this.currentIndex = this.history.length - 1;

      this.emit("history-compressed", {
        originalSize:
          this.history.length + (this.history.length - compressed.length),
        compressedSize: compressed.length,
        ratio: compressionRatio,
      });
    }
  }

  /**
   * 检查两个操作是否可以压缩
   */
  private canCompressOperations(
    op1: OperationRecord,
    op2: OperationRecord
  ): boolean {
    // 相同对象的相反操作可以压缩（创建+删除，移动回原位等）
    if (
      op1.targetIds.length === 1 &&
      op2.targetIds.length === 1 &&
      op1.targetIds[0] === op2.targetIds[0]
    ) {
      if (op1.type === "create-object" && op2.type === "delete-object") {
        return true; // 创建后立即删除，可以消除
      }

      if (op1.type === "move-object" && op2.type === "move-object") {
        // 检查是否移回了原位
        const finalPos = this.calculateFinalPosition(op1, op2);
        const originalPos = op1.previousData?.position;

        if (
          finalPos &&
          originalPos &&
          finalPos.x === originalPos.x &&
          finalPos.y === originalPos.y
        ) {
          return true; // 移回原位，可以消除
        }
      }
    }

    return false;
  }

  /**
   * 压缩两个操作
   */
  private compressOperations(
    op1: OperationRecord,
    op2: OperationRecord
  ): OperationRecord {
    // 创建压缩后的操作
    return {
      id: `compressed_${Date.now()}`,
      type: "batch" as OperationType,
      timestamp: op2.timestamp,
      targetIds: [...new Set([...op1.targetIds, ...op2.targetIds])],
      data: {
        operations: [op1, op2],
        compressed: true,
      },
      previousData: {
        operations: [op1.previousData, op2.previousData],
      },
      metadata: {
        version: 1,
        source: "compression",
        description: `压缩操作 (${op1.metadata.description}, ${op2.metadata.description})`,
        compressed: true,
        originalOperations: [op1.id, op2.id],
      },
      status: "applied",
      appliedAt: op2.appliedAt,
    };
  }

  /**
   * 尝试分组操作
   */
  private tryGroupOperations(
    op1: OperationRecord,
    op2: OperationRecord
  ): OperationRecord | null {
    for (const rule of this.groupingRules) {
      if (rule.predicate(op1, op2)) {
        // 检查分组大小限制
        if (rule.maxGroupSize && op1.metadata.mergeCount >= rule.maxGroupSize) {
          continue;
        }

        return rule.merge(op1, op2);
      }
    }

    return null;
  }

  /**
   * 工具方法
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private prepareData(data: any): any {
    if (!data) return data;

    if (this.config.deepCloneData) {
      return this.deepClone(data);
    }

    if (this.config.useCompression) {
      return this.compressData(data);
    }

    return data;
  }

  private deepClone(obj: any): any {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (error) {
      console.warn("Deep clone failed, using shallow copy:", error);
      return { ...obj };
    }
  }

  private compressData(data: any): any {
    // 简单的压缩：移除undefined和空值
    if (typeof data !== "object" || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.compressData(item));
    }

    const compressed: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null && value !== "") {
        compressed[key] = this.compressData(value);
      }
    }

    return compressed;
  }

  private calculateInverseData(record: OperationRecord): any {
    switch (record.type) {
      case "create-object":
        return { type: "delete-object", data: record.data };

      case "delete-object":
        return { type: "create-object", data: record.previousData };

      case "update-object":
      case "move-object":
      case "resize-object":
      case "rotate-object":
      case "change-style":
        return {
          type: record.type,
          data: record.previousData,
        };

      case "group-objects":
        return { type: "ungroup-objects", data: record.previousData };

      case "ungroup-objects":
        return { type: "group-objects", data: record.previousData };

      case "change-zindex":
        return { type: "change-zindex", data: record.previousData };

      case "viewport-change":
        return { type: "viewport-change", data: record.previousData };

      case "canvas-clear":
        return { type: "canvas-restore", data: record.previousData };

      default:
        return null;
    }
  }

  private detectUpdateType(
    oldData: CanvasObject,
    newData: Partial<CanvasObject>
  ): OperationType {
    if (
      newData.position &&
      (newData.position.x !== oldData.position.x ||
        newData.position.y !== oldData.position.y)
    ) {
      return "move-object";
    }

    if (
      newData.size &&
      (newData.size.x !== oldData.size.x || newData.size.y !== oldData.size.y)
    ) {
      return "resize-object";
    }

    if (
      newData.rotation !== undefined &&
      newData.rotation !== oldData.rotation
    ) {
      return "rotate-object";
    }

    if (
      newData.style &&
      JSON.stringify(newData.style) !== JSON.stringify(oldData.style)
    ) {
      return "change-style";
    }

    return "update-object";
  }

  private generateDescription(
    type: OperationType,
    targetIds: string[],
    data: any
  ): string {
    const objectCount = targetIds.length;

    switch (type) {
      case "create-object":
        return `创建${objectCount}个对象`;
      case "update-object":
        return `更新${objectCount}个对象`;
      case "delete-object":
        return `删除${objectCount}个对象`;
      case "move-object":
        return `移动${objectCount}个对象`;
      case "resize-object":
        return `调整${objectCount}个对象大小`;
      case "rotate-object":
        return `旋转${objectCount}个对象`;
      case "change-style":
        return `修改${objectCount}个对象样式`;
      case "group-objects":
        return `组合${objectCount}个对象`;
      case "ungroup-objects":
        return `取消组合${objectCount}个对象`;
      case "change-zindex":
        return `修改${objectCount}个对象层级`;
      case "viewport-change":
        return "视口变化";
      case "canvas-clear":
        return "清空画布";
      default:
        return "未知操作";
    }
  }

  private getUpdateDescription(
    type: OperationType,
    objectId: string,
    data: any
  ): string {
    switch (type) {
      case "move-object":
        return `移动对象到 (${data.position?.x}, ${data.position?.y})`;
      case "resize-object":
        return `调整对象大小为 ${data.size?.x} × ${data.size?.y}`;
      case "rotate-object":
        return `旋转对象 ${data.rotation}°`;
      case "change-style":
        return "修改对象样式";
      default:
        return "更新对象";
    }
  }

  private getObjectTypeName(type: string): string {
    const typeNames: Record<string, string> = {
      rectangle: "矩形",
      ellipse: "椭圆",
      circle: "圆形",
      text: "文本",
      image: "图片",
      path: "路径",
      line: "线条",
      polygon: "多边形",
      group: "组合",
    };

    return typeNames[type] || "对象";
  }

  private getOperationName(type: OperationType): string {
    const names: Record<OperationType, string> = {
      "create-object": "创建",
      "update-object": "更新",
      "delete-object": "删除",
      "move-object": "移动",
      "resize-object": "调整大小",
      "rotate-object": "旋转",
      "group-objects": "组合",
      "ungroup-objects": "取消组合",
      "change-style": "修改样式",
      "change-zindex": "修改层级",
      batch: "批量操作",
      "viewport-change": "视口变化",
      "canvas-clear": "清空",
    };

    return names[type] || "操作";
  }

  private calculateFinalPosition(
    op1: OperationRecord,
    op2: OperationRecord
  ): any {
    // 计算两个移动操作后的最终位置
    const pos1 = op1.data?.position || op1.data;
    const pos2 = op2.data?.position || op2.data;

    if (pos1 && pos2) {
      return {
        x: pos2.x,
        y: pos2.y,
      };
    }

    return null;
  }

  private createEmptyRecord(): OperationRecord {
    return {
      id: "",
      type: "update-object",
      timestamp: 0,
      targetIds: [],
      data: {},
      metadata: { version: 1, source: "program" },
      status: "applied",
    };
  }

  /**
   * 状态管理
   */
  canUndo(): boolean {
    return this.config.enabled && this.currentIndex >= 0;
  }

  canRedo(): boolean {
    return this.config.enabled && this.currentIndex < this.history.length - 1;
  }

  getState(): UndoRedoState {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      currentIndex: this.currentIndex,
      historySize: this.history.length,
      memoryUsage: this.performanceStats.memoryUsage,
      lastOperation: this.history[this.currentIndex],
    };
  }

  getHistory(): OperationRecord[] {
    return [...this.history];
  }

  getHistorySlice(start: number, end?: number): OperationRecord[] {
    return this.history.slice(start, end);
  }

  clearHistory(): void {
    this.history = [];
    this.currentIndex = -1;
    this.batchStack = [];
    this.currentBatch = null;
    this.stateCache.clear();
    this.objectSnapshots.clear();

    this.emit("history-cleared");
  }

  /**
   * 性能监控
   */
  private startMemoryMonitoring(): void {
    setInterval(() => {
      this.updateMemoryUsage();
    }, 5000);
  }

  private updateMemoryUsage(): void {
    // 估算内存使用
    let total = 0;

    this.history.forEach((record) => {
      total += JSON.stringify(record).length * 2; // 粗略估计
    });

    this.performanceStats.memoryUsage = total;

    // 检查内存限制
    if (total > this.config.memoryLimit * 0.9) {
      this.compressHistory();
      this.emit("memory-warning", {
        usage: total,
        limit: this.config.memoryLimit,
      });
    }
  }

  private updatePerformanceStats(type: "undo" | "redo", time: number): void {
    if (type === "undo") {
      this.performanceStats.undoCount++;
      this.performanceStats.averageUndoTime =
        (this.performanceStats.averageUndoTime *
          (this.performanceStats.undoCount - 1) +
          time) /
        this.performanceStats.undoCount;
    } else {
      this.performanceStats.redoCount++;
      this.performanceStats.averageRedoTime =
        (this.performanceStats.averageRedoTime *
          (this.performanceStats.redoCount - 1) +
          time) /
        this.performanceStats.redoCount;
    }

    this.performanceStats.totalOperations =
      this.performanceStats.undoCount + this.performanceStats.redoCount;
  }

  getPerformanceStats(): any {
    return { ...this.performanceStats };
  }

  /**
   * 事件系统
   */
  private emit(event: string, data?: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
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
   * 日志记录
   */
  private logOperation(record: OperationRecord): void {
    const logEntry = {
      timestamp: new Date(record.timestamp).toISOString(),
      id: record.id,
      type: record.type,
      targetCount: record.targetIds.length,
      description: record.metadata.description,
      dataSize: JSON.stringify(record.data).length,
      status: record.status,
    };

    console.log("[UndoRedo]", logEntry);
  }

  /**
   * 销毁清理
   */
  destroy(): void {
    this.clearHistory();
    this.listeners.clear();
    this.groupTimers.clear();
    this.pendingGroup.clear();

    console.log("UndoRedoManager destroyed");
  }
}
