// src/canvas/UndoRedoIntegration.ts
import { UndoRedoManager } from "../utils/UndoRedoManager";
import { InfiniteKonvaCanvas } from "./InfiniteKonvaCanvas";
import { CanvasObject, CanvasObjectUpdate } from "../types/canvas-object";

/**
 * 撤销/重做集成管理器
 */
export class UndoRedoIntegration {
  private canvas: InfiniteKonvaCanvas;
  private undoRedoManager: UndoRedoManager;
  private isProcessing = false;
  private pendingUpdates = new Map<
    string,
    { old: CanvasObject; new: Partial<CanvasObject> }
  >();
  private updateTimer: number | null = null;

  constructor(canvas: InfiniteKonvaCanvas) {
    this.canvas = canvas;
    this.undoRedoManager = new UndoRedoManager({
      maxHistorySize: 500,
      groupSimilarOps: true,
      groupTimeout: 1000,
      logOperations: true,
    });

    // 绑定事件
    this.setupEventListeners();

    // 设置键盘快捷键
    this.setupKeyboardShortcuts();
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    // 监听画布事件
    this.canvas.on("object-created", this.handleObjectCreated.bind(this));
    this.canvas.on("object-updated", this.handleObjectUpdated.bind(this));
    this.canvas.on("object-deleted", this.handleObjectDeleted.bind(this));
    this.canvas.on("objects-grouped", this.handleObjectsGrouped.bind(this));
    this.canvas.on("objects-ungrouped", this.handleObjectsUngrouped.bind(this));
    this.canvas.on("viewport-changed", this.handleViewportChanged.bind(this));
    this.canvas.on("canvas-cleared", this.handleCanvasCleared.bind(this));

    // 监听撤销管理器事件
    this.undoRedoManager.on(
      "execute-create",
      this.handleExecuteCreate.bind(this)
    );
    this.undoRedoManager.on(
      "execute-update",
      this.handleExecuteUpdate.bind(this)
    );
    this.undoRedoManager.on(
      "execute-delete",
      this.handleExecuteDelete.bind(this)
    );
    this.undoRedoManager.on(
      "execute-group",
      this.handleExecuteGroup.bind(this)
    );
    this.undoRedoManager.on(
      "execute-ungroup",
      this.handleExecuteUngroup.bind(this)
    );
    this.undoRedoManager.on(
      "execute-viewport-change",
      this.handleExecuteViewportChange.bind(this)
    );
    this.undoRedoManager.on(
      "execute-canvas-clear",
      this.handleExecuteCanvasClear.bind(this)
    );
    this.undoRedoManager.on(
      "execute-canvas-restore",
      this.handleExecuteCanvasRestore.bind(this)
    );
  }

  /**
   * 设置键盘快捷键
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", (e) => {
      // Ctrl/Cmd + Z: 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }

      // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y: 重做
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") ||
        ((e.ctrlKey || e.metaKey) && e.key === "y")
      ) {
        e.preventDefault();
        this.redo();
      }
    });
  }

  /**
   * 处理对象创建
   */
  private handleObjectCreated(event: any): void {
    if (this.isProcessing) return;

    const { object } = event;
    this.undoRedoManager.recordCreateObject(object);
  }

  /**
   * 处理对象更新（防抖优化）
   */
  private handleObjectUpdated(event: any): void {
    if (this.isProcessing) return;

    const { objectId, oldObject, newObject } = event;

    // 保存更新记录
    this.pendingUpdates.set(objectId, { old: oldObject, new: newObject });

    // 防抖处理
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = window.setTimeout(() => {
      this.processPendingUpdates();
    }, 100);
  }

  /**
   * 处理待处理的更新
   */
  private processPendingUpdates(): void {
    if (this.pendingUpdates.size === 0) return;

    // 开始批量操作
    this.undoRedoManager.beginBatch("批量更新");

    this.pendingUpdates.forEach(({ old, new: newData }, objectId) => {
      this.undoRedoManager.recordUpdateObject(objectId, newData, old);
    });

    // 结束批量操作
    this.undoRedoManager.endBatch();

    // 清空待处理更新
    this.pendingUpdates.clear();
    this.updateTimer = null;
  }

  /**
   * 处理对象删除
   */
  private handleObjectDeleted(event: any): void {
    if (this.isProcessing) return;

    const { object } = event;
    this.undoRedoManager.recordDeleteObject(object);
  }

  /**
   * 处理对象分组
   */
  private handleObjectsGrouped(event: any): void {
    if (this.isProcessing) return;

    const { groupId, objectIds } = event;
    this.undoRedoManager.recordOperation(
      "group-objects",
      [groupId, ...objectIds],
      { groupId, objectIds },
      undefined,
      { description: `组合${objectIds.length}个对象` }
    );
  }

  /**
   * 处理对象取消分组
   */
  private handleObjectsUngrouped(event: any): void {
    if (this.isProcessing) return;

    const { groupId, objectIds } = event;
    this.undoRedoManager.recordOperation(
      "ungroup-objects",
      [groupId, ...objectIds],
      { groupId, objectIds },
      undefined,
      { description: `取消组合${objectIds.length}个对象` }
    );
  }

  /**
   * 处理视口变化
   */
  private handleViewportChanged(event: any): void {
    if (this.isProcessing) return;

    const { viewport, oldViewport } = event;

    // 只有当变化足够大时才记录
    const dx = Math.abs(viewport.worldX - (oldViewport?.worldX || 0));
    const dy = Math.abs(viewport.worldY - (oldViewport?.worldY || 0));
    const dz = Math.abs(viewport.zoom - (oldViewport?.zoom || 1));

    if (dx > 10 || dy > 10 || dz > 0.1) {
      this.undoRedoManager.recordOperation(
        "viewport-change",
        [],
        viewport,
        oldViewport,
        { description: "视口导航" }
      );
    }
  }

  /**
   * 处理画布清空
   */
  private handleCanvasCleared(event: any): void {
    if (this.isProcessing) return;

    const { objects } = event; // 清空前的所有对象
    this.undoRedoManager.recordOperation(
      "canvas-clear",
      objects.map((obj: CanvasObject) => obj.id),
      null,
      objects,
      { description: `清空画布 (${objects.length}个对象)` }
    );
  }

  /**
   * 执行创建操作（来自撤销管理器）
   */
  private async handleExecuteCreate(event: any): Promise<void> {
    this.isProcessing = true;

    try {
      const { object } = event;
      await this.canvas.createObject(object);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 执行更新操作（来自撤销管理器）
   */
  private async handleExecuteUpdate(event: any): Promise<void> {
    this.isProcessing = true;

    try {
      const { objectId, data } = event;
      await this.canvas.updateObject({
        id: objectId,
        ...data,
        metadata: {
          ...data.metadata,
          updatedAt: Date.now(),
          version: (data.metadata?.version || 1) + 1,
        },
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 执行删除操作（来自撤销管理器）
   */
  private async handleExecuteDelete(event: any): Promise<void> {
    this.isProcessing = true;

    try {
      const { objectId } = event;
      await this.canvas.deleteObject(objectId);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 执行分组操作（来自撤销管理器）
   */
  private async handleExecuteGroup(event: any): Promise<void> {
    this.isProcessing = true;

    try {
      const { objectIds, data } = event;
      // 调用画布的分组方法
      await this.canvas.groupObjects(objectIds, data.groupId);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 执行取消分组操作（来自撤销管理器）
   */
  private async handleExecuteUngroup(event: any): Promise<void> {
    this.isProcessing = true;

    try {
      const { objectIds } = event;
      // 调用画布的取消分组方法
      await this.canvas.ungroupObjects(objectIds);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 执行视口变化操作（来自撤销管理器）
   */
  private async handleExecuteViewportChange(event: any): Promise<void> {
    this.isProcessing = true;

    try {
      const { viewport } = event;
      // 调用画布的视口设置方法
      this.canvas.setViewport(viewport);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 执行画布清空操作（来自撤销管理器）
   */
  private async handleExecuteCanvasClear(event: any): Promise<void> {
    this.isProcessing = true;

    try {
      await this.canvas.clear();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 执行画布恢复操作（来自撤销管理器）
   */
  private async handleExecuteCanvasRestore(event: any): Promise<void> {
    this.isProcessing = true;

    try {
      const { data } = event; // 所有对象数据

      // 批量恢复对象
      for (const object of data) {
        await this.canvas.createObject(object);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 公共API
   */
  undo(): Promise<void> {
    return this.undoRedoManager.undo().then((record) => {
      if (record) {
        console.log(`Undo: ${record.metadata.description}`);
      }
    });
  }

  redo(): Promise<void> {
    return this.undoRedoManager.redo().then((record) => {
      if (record) {
        console.log(`Redo: ${record.metadata.description}`);
      }
    });
  }

  canUndo(): boolean {
    return this.undoRedoManager.canUndo();
  }

  canRedo(): boolean {
    return this.undoRedoManager.canRedo();
  }

  getUndoRedoState(): any {
    return this.undoRedoManager.getState();
  }

  clearHistory(): void {
    this.undoRedoManager.clearHistory();
  }

  beginBatch(name?: string): void {
    this.undoRedoManager.beginBatch(name);
  }

  endBatch(): void {
    this.undoRedoManager.endBatch();
  }

  /**
   * 手动记录操作（用于编程式操作）
   */
  recordManualOperation(
    type: string,
    targetIds: string[],
    data: any,
    previousData?: any,
    description?: string
  ): void {
    this.undoRedoManager.recordOperation(
      type as any,
      targetIds,
      data,
      previousData,
      { description }
    );
  }

  /**
   * 获取操作历史（用于调试或保存）
   */
  getOperationHistory(): any[] {
    return this.undoRedoManager.getHistory();
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.undoRedoManager.destroy();
    this.pendingUpdates.clear();

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }
}
