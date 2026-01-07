import {
  CanvasObject,
  CanvasObjectUpdate,
  CanvasObjectCreate,
} from "./canvas-object";

/**
 * 数据源操作结果
 */
export interface DataSourceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

/**
 * 查询参数
 */
export interface QueryParams {
  ids?: string[];
  type?: string | string[];
  tags?: string[];
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;
}

/**
 * 查询结果
 */
export interface QueryResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * 分块数据查询
 */
export interface ChunkQuery {
  chunkX: number;
  chunkY: number;
  chunkSize: number;
  includeMetadata?: boolean;
  simplified?: boolean; // 是否返回简化版本
}

/**
 * 数据同步状态
 */
export interface SyncState {
  lastSyncTime: number;
  pendingOperations: number;
  conflicts: number;
  connected: boolean;
  version: string;
}

/**
 * 操作记录（用于撤销/重做和同步）
 */
export interface OperationRecord {
  id: string;
  type: "create" | "update" | "delete" | "batch";
  targetIds: string[];
  data: any;
  timestamp: number;
  author?: string;
  version: number;
  previousState?: any;
  nextState?: any;
}

/**
 * 冲突解决策略
 */
export interface ConflictResolution {
  strategy: "last-write-wins" | "manual" | "merge";
  ours?: any;
  theirs?: any;
  resolved?: any;
  timestamp: number;
}

/**
 * 数据源事件类型
 */
export type DataSourceEventType =
  | "object-created"
  | "object-updated"
  | "object-deleted"
  | "batch-completed"
  | "sync-started"
  | "sync-completed"
  | "conflict-detected"
  | "error-occurred"
  | "connection-changed";

/**
 * 数据源事件数据
 */
export interface DataSourceEvent {
  type: DataSourceEventType;
  data?: any;
  timestamp: number;
  source?: string;
}

/**
 * 数据源配置
 */
export interface DataSourceConfig {
  // 缓存配置
  cacheEnabled: boolean;
  cacheSize: number;
  cacheTTL: number; // 生存时间（毫秒）

  // 同步配置
  syncEnabled: boolean;
  syncInterval: number;
  autoSync: boolean;
  conflictStrategy: "last-write-wins" | "manual" | "merge";

  // 离线支持
  offlineSupport: boolean;
  offlineQueueSize: number;

  // 性能优化
  batchOperations: boolean;
  batchSize: number;
  debounceTime: number;

  // 安全
  encryptionEnabled: boolean;
  compressionEnabled: boolean;

  // 调试
  verboseLogging: boolean;
}

/**
 * 数据源接口定义
 */
export interface ICanvasDataSource {
  // === 基础CRUD操作 ===

  /**
   * 创建单个对象
   */
  createObject(
    object: CanvasObjectCreate
  ): Promise<DataSourceResult<CanvasObject>>;

  /**
   * 批量创建对象
   */
  createObjects(
    objects: CanvasObjectCreate[]
  ): Promise<DataSourceResult<CanvasObject[]>>;

  /**
   * 获取单个对象
   */
  getObject(id: string): Promise<DataSourceResult<CanvasObject>>;

  /**
   * 批量获取对象
   */
  getObjects(ids: string[]): Promise<DataSourceResult<CanvasObject[]>>;

  /**
   * 查询对象
   */
  queryObjects(
    params: QueryParams
  ): Promise<DataSourceResult<QueryResult<CanvasObject>>>;

  /**
   * 更新对象
   */
  updateObject(
    update: CanvasObjectUpdate
  ): Promise<DataSourceResult<CanvasObject>>;

  /**
   * 批量更新对象
   */
  updateObjects(
    updates: CanvasObjectUpdate[]
  ): Promise<DataSourceResult<CanvasObject[]>>;

  /**
   * 删除对象
   */
  deleteObject(id: string): Promise<DataSourceResult<boolean>>;

  /**
   * 批量删除对象
   */
  deleteObjects(ids: string[]): Promise<DataSourceResult<boolean>>;

  // === 分块相关操作 ===

  /**
   * 获取分块数据
   */
  getChunkData(query: ChunkQuery): Promise<DataSourceResult<CanvasObject[]>>;

  /**
   * 保存分块数据
   */
  saveChunkData(
    chunkX: number,
    chunkY: number,
    objects: CanvasObject[]
  ): Promise<DataSourceResult<boolean>>;

  /**
   * 获取分块元数据
   */
  getChunkMetadata(
    chunkX: number,
    chunkY: number
  ): Promise<DataSourceResult<any>>;

  // === 同步相关操作 ===

  /**
   * 开始同步
   */
  startSync(): Promise<DataSourceResult<SyncState>>;

  /**
   * 停止同步
   */
  stopSync(): Promise<DataSourceResult<void>>;

  /**
   * 获取同步状态
   */
  getSyncState(): Promise<DataSourceResult<SyncState>>;

  /**
   * 解决冲突
   */
  resolveConflict(
    conflictId: string,
    resolution: ConflictResolution
  ): Promise<DataSourceResult<void>>;

  // === 历史/版本相关 ===

  /**
   * 获取对象历史
   */
  getObjectHistory(
    id: string,
    limit?: number
  ): Promise<DataSourceResult<OperationRecord[]>>;

  /**
   * 撤销操作
   */
  undo(operationId?: string): Promise<DataSourceResult<CanvasObject[]>>;

  /**
   * 重做操作
   */
  redo(operationId?: string): Promise<DataSourceResult<CanvasObject[]>>;

  /**
   * 获取操作历史
   */
  getOperationHistory(
    limit?: number,
    offset?: number
  ): Promise<DataSourceResult<OperationRecord[]>>;

  // === 批量操作 ===

  /**
   * 执行批量操作
   */
  executeBatch(
    operations: OperationRecord[]
  ): Promise<DataSourceResult<boolean>>;

  // === 导入/导出 ===

  /**
   * 导出数据
   */
  exportData(options?: any): Promise<DataSourceResult<any>>;

  /**
   * 导入数据
   */
  importData(
    data: any,
    options?: any
  ): Promise<DataSourceResult<CanvasObject[]>>;

  // === 事件监听 ===

  /**
   * 添加事件监听器
   */
  on(
    eventType: DataSourceEventType,
    handler: (event: DataSourceEvent) => void
  ): void;

  /**
   * 移除事件监听器
   */
  off(
    eventType: DataSourceEventType,
    handler: (event: DataSourceEvent) => void
  ): void;

  // === 配置管理 ===

  /**
   * 获取配置
   */
  getConfig(): DataSourceConfig;

  /**
   * 更新配置
   */
  updateConfig(
    config: Partial<DataSourceConfig>
  ): Promise<DataSourceResult<void>>;

  // === 生命周期 ===

  /**
   * 初始化数据源
   */
  initialize(): Promise<DataSourceResult<void>>;

  /**
   * 清理数据源
   */
  cleanup(): Promise<DataSourceResult<void>>;

  /**
   * 销毁数据源
   */
  destroy(): Promise<DataSourceResult<void>>;
}

/**
 * 抽象基类实现
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

/**
 * 本地存储数据源实现
 */
export class LocalStorageDataSource extends CanvasDataSource {
  private storageKey: string;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  constructor(storageKey?: string, config?: Partial<DataSourceConfig>) {
    super(config);
    this.storageKey = storageKey || "infinite-canvas-data";
    this.initializeCache();
  }

  private initializeCache(): void {
    if (this.config.cacheEnabled) {
      // 从本地存储加载缓存
      try {
        const cached = localStorage.getItem(`${this.storageKey}_cache`);
        if (cached) {
          const parsed = JSON.parse(cached);
          Object.entries(parsed).forEach(([key, value]: [string, any]) => {
            if (Date.now() - value.timestamp < this.config.cacheTTL) {
              this.cache.set(key, value);
            }
          });
        }
      } catch (error) {
        console.warn("Failed to load cache:", error);
      }
    }
  }

  private saveCache(): void {
    if (this.config.cacheEnabled) {
      try {
        const cacheObj: Record<string, any> = {};
        this.cache.forEach((value, key) => {
          cacheObj[key] = value;
        });
        localStorage.setItem(
          `${this.storageKey}_cache`,
          JSON.stringify(cacheObj)
        );
      } catch (error) {
        console.warn("Failed to save cache:", error);
      }
    }
  }

  private getStorageData(): any {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data
        ? JSON.parse(data)
        : { objects: {}, chunks: {}, metadata: {} };
    } catch (error) {
      console.error("Failed to read storage data:", error);
      return { objects: {}, chunks: {}, metadata: {} };
    }
  }

  private saveStorageData(data: any): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error("Failed to save storage data:", error);
    }
  }

  async createObject(
    object: CanvasObjectCreate
  ): Promise<DataSourceResult<CanvasObject>> {
    try {
      const data = this.getStorageData();
      const id =
        object.id ||
        `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newObject: CanvasObject = {
        ...object,
        id,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: "user",
          version: 1,
          ...object.metadata,
        },
      };

      data.objects[id] = newObject;
      this.saveStorageData(data);

      // 更新缓存
      if (this.config.cacheEnabled) {
        this.cache.set(`object_${id}`, {
          data: newObject,
          timestamp: Date.now(),
        });
        this.saveCache();
      }

      this.emitEvent("object-created", newObject);

      return {
        success: true,
        data: newObject,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      };
    }
  }

  async createObjects(
    objects: CanvasObjectCreate[]
  ): Promise<DataSourceResult<CanvasObject[]>> {
    const results: CanvasObject[] = [];

    for (const object of objects) {
      const result = await this.createObject(object);
      if (result.success && result.data) {
        results.push(result.data);
      }
    }

    return {
      success: true,
      data: results,
      timestamp: Date.now(),
    };
  }

  async getObject(id: string): Promise<DataSourceResult<CanvasObject>> {
    // 检查缓存
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(`object_${id}`);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return {
          success: true,
          data: cached.data,
          timestamp: Date.now(),
        };
      }
    }

    try {
      const data = this.getStorageData();
      const object = data.objects[id];

      if (!object) {
        return {
          success: false,
          error: "Object not found",
          timestamp: Date.now(),
        };
      }

      // 更新缓存
      if (this.config.cacheEnabled) {
        this.cache.set(`object_${id}`, {
          data: object,
          timestamp: Date.now(),
        });
        this.saveCache();
      }

      return {
        success: true,
        data: object,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      };
    }
  }

  async getObjects(ids: string[]): Promise<DataSourceResult<CanvasObject[]>> {
    const objects: CanvasObject[] = [];

    for (const id of ids) {
      const result = await this.getObject(id);
      if (result.success && result.data) {
        objects.push(result.data);
      }
    }

    return {
      success: true,
      data: objects,
      timestamp: Date.now(),
    };
  }

  async queryObjects(
    params: QueryParams
  ): Promise<DataSourceResult<QueryResult<CanvasObject>>> {
    try {
      const data = this.getStorageData();
      let objects = Object.values(data.objects) as CanvasObject[];

      // 应用过滤器
      if (params.ids) {
        objects = objects.filter((obj) => params.ids!.includes(obj.id));
      }

      if (params.type) {
        const types = Array.isArray(params.type) ? params.type : [params.type];
        objects = objects.filter((obj) => types.includes(obj.type));
      }

      if (params.tags) {
        objects = objects.filter((obj) =>
          obj.metadata.tags?.some((tag: string) => params.tags!.includes(tag))
        );
      }

      if (params.bounds) {
        const { x, y, width, height } = params.bounds;
        objects = objects.filter(
          (obj) =>
            obj.position.x >= x &&
            obj.position.x <= x + width &&
            obj.position.y >= y &&
            obj.position.y <= y + height
        );
      }

      if (params.createdAfter) {
        objects = objects.filter(
          (obj) => obj.metadata.createdAt >= params.createdAfter!
        );
      }

      if (params.createdBefore) {
        objects = objects.filter(
          (obj) => obj.metadata.createdAt <= params.createdBefore!
        );
      }

      // 排序
      if (params.sortBy) {
        objects.sort((a, b) => {
          const aVal = this.getNestedValue(a, params.sortBy!);
          const bVal = this.getNestedValue(b, params.sortBy!);

          if (aVal < bVal) return params.sortOrder === "desc" ? 1 : -1;
          if (aVal > bVal) return params.sortOrder === "desc" ? -1 : 1;
          return 0;
        });
      }

      // 分页
      const total = objects.length;
      const page =
        Math.floor((params.offset || 0) / (params.limit || total)) + 1;
      const pageSize = params.limit || total;

      if (params.limit) {
        const start = params.offset || 0;
        objects = objects.slice(start, start + params.limit);
      }

      return {
        success: true,
        data: {
          items: objects,
          total,
          page,
          pageSize,
          hasMore: (params.offset || 0) + objects.length < total,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      };
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  async updateObject(
    update: CanvasObjectUpdate
  ): Promise<DataSourceResult<CanvasObject>> {
    try {
      const data = this.getStorageData();
      const existing = data.objects[update.id];

      if (!existing) {
        return {
          success: false,
          error: "Object not found",
          timestamp: Date.now(),
        };
      }

      // 合并更新
      const updatedObject: CanvasObject = {
        ...existing,
        ...update,
        metadata: {
          ...existing.metadata,
          ...update.metadata,
          updatedAt: Date.now(),
          version: (existing.metadata.version || 1) + 1,
        },
      };

      data.objects[update.id] = updatedObject;
      this.saveStorageData(data);

      // 更新缓存
      if (this.config.cacheEnabled) {
        this.cache.set(`object_${update.id}`, {
          data: updatedObject,
          timestamp: Date.now(),
        });
        this.saveCache();
      }

      this.emitEvent("object-updated", updatedObject);

      return {
        success: true,
        data: updatedObject,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      };
    }
  }

  async updateObjects(
    updates: CanvasObjectUpdate[]
  ): Promise<DataSourceResult<CanvasObject[]>> {
    const results: CanvasObject[] = [];

    for (const update of updates) {
      const result = await this.updateObject(update);
      if (result.success && result.data) {
        results.push(result.data);
      }
    }

    return {
      success: true,
      data: results,
      timestamp: Date.now(),
    };
  }

  async deleteObject(id: string): Promise<DataSourceResult<boolean>> {
    try {
      const data = this.getStorageData();

      if (!data.objects[id]) {
        return {
          success: false,
          error: "Object not found",
          timestamp: Date.now(),
        };
      }

      delete data.objects[id];
      this.saveStorageData(data);

      // 清理缓存
      if (this.config.cacheEnabled) {
        this.cache.delete(`object_${id}`);
        this.saveCache();
      }

      this.emitEvent("object-deleted", { id });

      return {
        success: true,
        data: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      };
    }
  }

  async deleteObjects(ids: string[]): Promise<DataSourceResult<boolean>> {
    for (const id of ids) {
      const result = await this.deleteObject(id);
      if (!result.success) {
        return result;
      }
    }

    return {
      success: true,
      data: true,
      timestamp: Date.now(),
    };
  }

  async getChunkData(
    query: ChunkQuery
  ): Promise<DataSourceResult<CanvasObject[]>> {
    try {
      const data = this.getStorageData();
      const chunkKey = `chunk_${query.chunkX}_${query.chunkY}`;

      // 检查是否有缓存的块数据
      if (data.chunks && data.chunks[chunkKey]) {
        const chunkObjectIds = data.chunks[chunkKey];
        const objects = await this.getObjects(chunkObjectIds);
        return {
          success: true,
          data: objects.data || [],
          timestamp: Date.now(),
        };
      }

      // 否则，查询该区域内的对象
      const bounds = {
        x: query.chunkX * query.chunkSize,
        y: query.chunkY * query.chunkSize,
        width: query.chunkSize,
        height: query.chunkSize,
      };

      const queryResult = await this.queryObjects({ bounds });

      if (!queryResult.success || !queryResult.data) {
        return {
          success: false,
          error: queryResult.error,
          timestamp: Date.now(),
        };
      }

      // 缓存块数据
      data.chunks = data.chunks || {};
      data.chunks[chunkKey] = queryResult.data.items.map((obj) => obj.id);
      this.saveStorageData(data);

      return {
        success: true,
        data: queryResult.data.items,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      };
    }
  }

  async saveChunkData(
    chunkX: number,
    chunkY: number,
    objects: CanvasObject[]
  ): Promise<DataSourceResult<boolean>> {
    try {
      const data = this.getStorageData();
      const chunkKey = `chunk_${chunkX}_${chunkY}`;

      // 更新块数据
      data.chunks = data.chunks || {};
      data.chunks[chunkKey] = objects.map((obj) => obj.id);

      // 更新对象数据
      objects.forEach((obj) => {
        data.objects[obj.id] = obj;
      });

      this.saveStorageData(data);

      return {
        success: true,
        data: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      };
    }
  }

  async cleanup(): Promise<DataSourceResult<void>> {
    // 清理过期缓存
    if (this.config.cacheEnabled) {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.config.cacheTTL) {
          this.cache.delete(key);
        }
      }
      this.saveCache();
    }

    return {
      success: true,
      timestamp: Date.now(),
    };
  }

  async destroy(): Promise<DataSourceResult<void>> {
    await super.destroy();
    this.cache.clear();
    return {
      success: true,
      timestamp: Date.now(),
    };
  }
}

/**
 * 远程API数据源实现（示例）
 */
export class RemoteAPIDataSource extends CanvasDataSource {
  private baseUrl: string;
  private authToken?: string;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;

  constructor(baseUrl: string, config?: Partial<DataSourceConfig>) {
    super({
      syncEnabled: true,
      autoSync: true,
      batchOperations: true,
      ...config,
    });

    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  private async queueRequest<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          console.error("Request failed:", error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  async createObject(
    object: CanvasObjectCreate
  ): Promise<DataSourceResult<CanvasObject>> {
    return this.queueRequest(async () => {
      const response = await this.makeRequest<DataSourceResult<CanvasObject>>(
        "/objects",
        {
          method: "POST",
          body: JSON.stringify(object),
        }
      );

      if (response.success) {
        this.emitEvent("object-created", response.data);
      }

      return response;
    });
  }

  // 其他方法的实现类似...
  // 为了简洁，这里省略了完整的远程API实现

  async initialize(): Promise<DataSourceResult<void>> {
    try {
      // 检查连接
      await this.makeRequest("/health");
      this.emitEvent("connection-changed", { connected: true });

      return {
        success: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to connect to server",
        timestamp: Date.now(),
      };
    }
  }
}

/**
 * 混合数据源（本地缓存 + 远程同步）
 */
export class HybridDataSource extends CanvasDataSource {
  private localSource: LocalStorageDataSource;
  private remoteSource?: RemoteAPIDataSource;
  private syncQueue: OperationRecord[] = [];
  private isSyncing = false;

  constructor(config?: Partial<DataSourceConfig>) {
    super({
      syncEnabled: true,
      autoSync: true,
      offlineSupport: true,
      ...config,
    });

    this.localSource = new LocalStorageDataSource("hybrid-canvas", config);

    if (this.config.syncEnabled) {
      this.remoteSource = new RemoteAPIDataSource(
        "https://api.example.com",
        config
      );
    }

    // 转发事件
    this.localSource.on("object-created", (event) =>
      this.emitEvent("object-created", event.data)
    );
    this.localSource.on("object-updated", (event) =>
      this.emitEvent("object-updated", event.data)
    );
    this.localSource.on("object-deleted", (event) =>
      this.emitEvent("object-deleted", event.data)
    );
  }

  async createObject(
    object: CanvasObjectCreate
  ): Promise<DataSourceResult<CanvasObject>> {
    // 先保存到本地
    const localResult = await this.localSource.createObject(object);

    if (!localResult.success || !localResult.data) {
      return localResult;
    }

    // 如果在线，同步到远程
    if (this.remoteSource && this.config.syncEnabled) {
      this.queueForSync({
        type: "create",
        targetIds: [localResult.data.id],
        data: localResult.data,
        timestamp: Date.now(),
        author: "user",
        version: 1,
      });
    }

    return localResult;
  }

  private queueForSync(operation: OperationRecord): void {
    this.syncQueue.push(operation);

    if (this.config.autoSync && !this.isSyncing) {
      this.startSync();
    }
  }

  async startSync(): Promise<DataSourceResult<SyncState>> {
    if (this.isSyncing || !this.remoteSource || this.syncQueue.length === 0) {
      return await super.getSyncState();
    }

    this.isSyncing = true;
    this.emitEvent("sync-started");

    try {
      const operations = [...this.syncQueue];
      this.syncQueue = [];

      // 同步操作到远程
      for (const operation of operations) {
        try {
          switch (operation.type) {
            case "create":
              await this.remoteSource.createObject(operation.data);
              break;
            case "update":
              await this.remoteSource.updateObject(operation.data);
              break;
            case "delete":
              await this.remoteSource.deleteObject(operation.targetIds[0]);
              break;
          }
        } catch (error) {
          // 同步失败，放回队列
          this.syncQueue.push(operation);
          console.error("Sync failed:", error);
        }
      }

      this.emitEvent("sync-completed");
    } finally {
      this.isSyncing = false;
    }

    return await super.getSyncState();
  }

  // 代理其他方法到本地数据源
  async getObject(id: string): Promise<DataSourceResult<CanvasObject>> {
    return this.localSource.getObject(id);
  }

  async getObjects(ids: string[]): Promise<DataSourceResult<CanvasObject[]>> {
    return this.localSource.getObjects(ids);
  }

  async queryObjects(
    params: QueryParams
  ): Promise<DataSourceResult<QueryResult<CanvasObject>>> {
    return this.localSource.queryObjects(params);
  }

  async updateObject(
    update: CanvasObjectUpdate
  ): Promise<DataSourceResult<CanvasObject>> {
    const result = await this.localSource.updateObject(update);

    if (result.success && this.remoteSource && this.config.syncEnabled) {
      this.queueForSync({
        type: "update",
        targetIds: [update.id],
        data: update,
        timestamp: Date.now(),
        author: "user",
        version: 1,
      });
    }

    return result;
  }

  async deleteObject(id: string): Promise<DataSourceResult<boolean>> {
    const result = await this.localSource.deleteObject(id);

    if (result.success && this.remoteSource && this.config.syncEnabled) {
      this.queueForSync({
        type: "delete",
        targetIds: [id],
        data: { id },
        timestamp: Date.now(),
        author: "user",
        version: 1,
      });
    }

    return result;
  }

  async getChunkData(
    query: ChunkQuery
  ): Promise<DataSourceResult<CanvasObject[]>> {
    return this.localSource.getChunkData(query);
  }

  async cleanup(): Promise<DataSourceResult<void>> {
    await this.localSource.cleanup();
    return super.cleanup();
  }

  async destroy(): Promise<DataSourceResult<void>> {
    await this.localSource.destroy();
    if (this.remoteSource) {
      await this.remoteSource.destroy();
    }
    return super.destroy();
  }
}
