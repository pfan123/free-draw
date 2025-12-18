// src/data/sources/base/CanvasDataSource.ts
import CanvasObject, {
  CanvasObjectCreate,
  CanvasObjectUpdate,
} from "../../../types/canvas-object";
import {
  ICanvasDataSource,
  DataSourceConfig,
  DataSourceEventType,
  DataSourceEvent,
  DataSourceResult,
  QueryParams,
  QueryResult,
  ChunkQuery,
  OperationRecord,
  ConflictResolution,
  SyncState,
} from "../../../types/data-source";

/**
 * 抽象基类 CanvasDataSource - 数据源管理器（抽象类）
 * 所有具体数据源都应该继承这个类
 */
export abstract class CanvasDataSource implements ICanvasDataSource {
  protected config: DataSourceConfig;
  protected eventHandlers: Map<DataSourceEventType, Set<Function>> = new Map();

  constructor(config?: Partial<DataSourceConfig>) {
    this.config = {
      cacheEnabled: true,
      cacheSize: 1000,
      cacheTTL: 300000, // 5分钟
      syncEnabled: false,
      syncInterval: 30000, // 30秒
      autoSync: true,
      conflictStrategy: "last-write-wins",
      offlineSupport: false,
      offlineQueueSize: 100,
      batchOperations: true,
      batchSize: 50,
      debounceTime: 100,
      encryptionEnabled: false,
      compressionEnabled: false,
      verboseLogging: false,
      ...config,
    };
  }

  // 必须实现的方法（抽象方法）
  abstract createObject(
    object: CanvasObjectCreate
  ): Promise<DataSourceResult<CanvasObject>>;
  abstract createObjects(
    objects: CanvasObjectCreate[]
  ): Promise<DataSourceResult<CanvasObject[]>>;
  abstract getObject(id: string): Promise<DataSourceResult<CanvasObject>>;
  abstract getObjects(ids: string[]): Promise<DataSourceResult<CanvasObject[]>>;
  abstract queryObjects(
    params: QueryParams
  ): Promise<DataSourceResult<QueryResult<CanvasObject>>>;
  abstract updateObject(
    update: CanvasObjectUpdate
  ): Promise<DataSourceResult<CanvasObject>>;
  abstract updateObjects(
    updates: CanvasObjectUpdate[]
  ): Promise<DataSourceResult<CanvasObject[]>>;
  abstract deleteObject(id: string): Promise<DataSourceResult<boolean>>;
  abstract deleteObjects(ids: string[]): Promise<DataSourceResult<boolean>>;
  abstract getChunkData(
    query: ChunkQuery
  ): Promise<DataSourceResult<CanvasObject[]>>;

  // 可选实现的方法（默认抛出错误）
  async saveChunkData(
    chunkX: number,
    chunkY: number,
    objects: CanvasObject[]
  ): Promise<DataSourceResult<boolean>> {
    throw new Error("saveChunkData not implemented");
  }

  async getChunkMetadata(
    chunkX: number,
    chunkY: number
  ): Promise<DataSourceResult<any>> {
    throw new Error("getChunkMetadata not implemented");
  }

  async startSync(): Promise<DataSourceResult<SyncState>> {
    throw new Error("startSync not implemented");
  }

  async stopSync(): Promise<DataSourceResult<void>> {
    throw new Error("stopSync not implemented");
  }

  async getSyncState(): Promise<DataSourceResult<SyncState>> {
    return {
      success: true,
      data: {
        lastSyncTime: Date.now(),
        pendingOperations: 0,
        conflicts: 0,
        connected: true,
        version: "1.0.0",
      },
      timestamp: Date.now(),
    };
  }

  async resolveConflict(
    conflictId: string,
    resolution: ConflictResolution
  ): Promise<DataSourceResult<void>> {
    throw new Error("resolveConflict not implemented");
  }

  async getObjectHistory(
    id: string,
    limit?: number
  ): Promise<DataSourceResult<OperationRecord[]>> {
    return {
      success: true,
      data: [],
      timestamp: Date.now(),
    };
  }

  async undo(operationId?: string): Promise<DataSourceResult<CanvasObject[]>> {
    throw new Error("undo not implemented");
  }

  async redo(operationId?: string): Promise<DataSourceResult<CanvasObject[]>> {
    throw new Error("redo not implemented");
  }

  async getOperationHistory(
    limit?: number,
    offset?: number
  ): Promise<DataSourceResult<OperationRecord[]>> {
    return {
      success: true,
      data: [],
      timestamp: Date.now(),
    };
  }

  async executeBatch(
    operations: OperationRecord[]
  ): Promise<DataSourceResult<boolean>> {
    // 默认实现：顺序执行操作
    for (const operation of operations) {
      // 根据操作类型执行相应操作
      // 这里需要根据实际需求实现
    }

    return {
      success: true,
      data: true,
      timestamp: Date.now(),
    };
  }

  async exportData(options?: any): Promise<DataSourceResult<any>> {
    // 获取所有对象
    const result = await this.queryObjects({ limit: 10000 });

    if (!result.success || !result.data) {
      return result;
    }

    return {
      success: true,
      data: {
        version: "1.0",
        exportedAt: Date.now(),
        objects: result.data.items,
        total: result.data.total,
      },
      timestamp: Date.now(),
    };
  }

  async importData(
    data: any,
    options?: any
  ): Promise<DataSourceResult<CanvasObject[]>> {
    // 验证数据格式
    if (!data || !data.objects || !Array.isArray(data.objects)) {
      return {
        success: false,
        error: "Invalid data format",
        timestamp: Date.now(),
      };
    }

    // 批量创建对象
    const objects: CanvasObjectCreate[] = data.objects.map((obj: any) => ({
      ...obj,
      id:
        obj.id ||
        `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }));

    return await this.createObjects(objects);
  }

  // 事件处理
  on(
    eventType: DataSourceEventType,
    handler: (event: DataSourceEvent) => void
  ): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  off(
    eventType: DataSourceEventType,
    handler: (event: DataSourceEvent) => void
  ): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  protected emitEvent(eventType: DataSourceEventType, data?: any): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const event: DataSourceEvent = {
        type: eventType,
        data,
        timestamp: Date.now(),
        source: this.constructor.name,
      };

      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  // 配置管理
  getConfig(): DataSourceConfig {
    return { ...this.config };
  }

  async updateConfig(
    config: Partial<DataSourceConfig>
  ): Promise<DataSourceResult<void>> {
    this.config = { ...this.config, ...config };
    return {
      success: true,
      timestamp: Date.now(),
    };
  }

  // 生命周期
  async initialize(): Promise<DataSourceResult<void>> {
    return {
      success: true,
      timestamp: Date.now(),
    };
  }

  async cleanup(): Promise<DataSourceResult<void>> {
    return {
      success: true,
      timestamp: Date.now(),
    };
  }

  async destroy(): Promise<DataSourceResult<void>> {
    // 清理事件监听器
    this.eventHandlers.clear();

    return {
      success: true,
      timestamp: Date.now(),
    };
  }
}
