import { CanvasDataSource } from "../base/CanvasDataSource";
import {
  DataSourceResult,
  QueryParams,
  QueryResult,
  ChunkQuery,
  OperationRecord,
  SyncState,
  ConflictResolution,
} from "../../../types/data-source";
import {
  CanvasObject,
  CanvasObjectUpdate,
  CanvasObjectCreate,
} from "../../../types/canvas-object";

/**
 * 内存数据源 - 纯内存存储，不持久化
 * 特点：
 * 1. 性能极高（所有操作都在内存中）
 * 2. 数据在页面刷新或关闭时丢失
 * 3. 支持所有数据源接口
 * 4. 适合临时编辑和演示
 *
 *
 */
export class MemoryDataSource extends CanvasDataSource {
  // 内存存储结构
  private objects: Map<string, CanvasObject> = new Map();
  private chunks: Map<string, Set<string>> = new Map(); // chunkId -> objectIds
  private operationHistory: OperationRecord[] = [];
  private states: Map<string, any> = new Map(); // 保存的状态

  // 索引和缓存
  private typeIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private spatialIndex: Map<string, Set<string>> = new Map(); // 简化的空间索引

  // 同步状态
  private syncState: SyncState = {
    lastSyncTime: Date.now(),
    pendingOperations: 0,
    conflicts: 0,
    connected: true,
    version: "1.0.0",
  };

  // 冲突记录
  private conflicts: Map<string, any> = new Map();

  // 性能监控
  private metrics = {
    totalOperations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageQueryTime: 0,
  };

  constructor(config?: any) {
    super({
      cacheEnabled: true,
      cacheSize: 10000,
      cacheTTL: 0, // 永不过期
      syncEnabled: false, // 内存数据源通常不需要同步
      autoSync: false,
      batchOperations: true,
      batchSize: 100,
      debounceTime: 0, // 立即执行
      verboseLogging: false,
      ...config,
    });

    // 初始化索引
    this.initializeIndexes();
  }

  /**
   * 初始化索引
   */
  private initializeIndexes(): void {
    this.typeIndex = new Map();
    this.tagIndex = new Map();
    this.spatialIndex = new Map();

    // 预定义一些常见类型的索引
    const commonTypes = [
      "rectangle",
      "ellipse",
      "text",
      "image",
      "path",
      "line",
    ];
    commonTypes.forEach((type) => {
      this.typeIndex.set(type, new Set());
    });
  }

  /**
   * 创建对象
   */
  async createObject(
    object: CanvasObjectCreate
  ): Promise<DataSourceResult<CanvasObject>> {
    const startTime = performance.now();

    try {
      // 生成ID（如果未提供）
      const id = object.id || this.generateObjectId();

      // 创建完整对象
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

      // 检查是否已存在
      if (this.objects.has(id)) {
        return {
          success: false,
          error: `Object with id ${id} already exists`,
          timestamp: Date.now(),
        };
      }

      // 存储对象
      this.objects.set(id, newObject);

      // 更新索引
      this.updateIndexesForObject(id, newObject);

      // 添加到分块索引
      this.addObjectToChunkIndex(newObject);

      // 记录操作
      this.recordOperation("create", [id], newObject);

      // 更新性能指标
      this.updateMetrics(performance.now() - startTime);

      // 触发事件
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

  /**
   * 批量创建对象
   */
  async createObjects(
    objects: CanvasObjectCreate[]
  ): Promise<DataSourceResult<CanvasObject[]>> {
    const startTime = performance.now();
    const createdObjects: CanvasObject[] = [];
    const errors: string[] = [];

    // 使用批处理提高性能
    const batchPromises = objects.map(async (object, index) => {
      try {
        const result = await this.createObject(object);
        if (result.success && result.data) {
          createdObjects.push(result.data);
        } else {
          errors.push(`Object ${index}: ${result.error}`);
        }
      } catch (error) {
        errors.push(
          `Object ${index}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    });

    await Promise.all(batchPromises);

    this.updateMetrics(performance.now() - startTime);

    if (errors.length > 0) {
      return {
        success: false,
        error: `Some objects failed to create: ${errors.join(", ")}`,
        data: createdObjects,
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      data: createdObjects,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取对象
   */
  async getObject(id: string): Promise<DataSourceResult<CanvasObject>> {
    const startTime = performance.now();

    try {
      // 检查缓存
      if (this.config.cacheEnabled) {
        this.metrics.cacheHits++;
      }

      const object = this.objects.get(id);

      if (!object) {
        this.metrics.cacheMisses++;
        return {
          success: false,
          error: `Object with id ${id} not found`,
          timestamp: Date.now(),
        };
      }

      this.updateMetrics(performance.now() - startTime);

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

  /**
   * 批量获取对象
   */
  async getObjects(ids: string[]): Promise<DataSourceResult<CanvasObject[]>> {
    const startTime = performance.now();
    const objects: CanvasObject[] = [];
    const missingIds: string[] = [];

    for (const id of ids) {
      const object = this.objects.get(id);
      if (object) {
        objects.push(object);
      } else {
        missingIds.push(id);
      }
    }

    this.updateMetrics(performance.now() - startTime);

    if (missingIds.length > 0) {
      return {
        success: false,
        error: `Objects not found: ${missingIds.join(", ")}`,
        data: objects,
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      data: objects,
      timestamp: Date.now(),
    };
  }

  /**
   * 查询对象
   */
  async queryObjects(
    params: QueryParams
  ): Promise<DataSourceResult<QueryResult<CanvasObject>>> {
    const startTime = performance.now();

    try {
      // 获取所有对象
      let objects = Array.from(this.objects.values());

      // 应用过滤器
      objects = this.applyFilters(objects, params);

      // 应用排序
      objects = this.applySorting(objects, params);

      // 计算分页
      const total = objects.length;
      const pageSize = params.limit || total;
      const page = Math.floor((params.offset || 0) / pageSize) + 1;

      if (params.limit) {
        const start = params.offset || 0;
        objects = objects.slice(start, start + params.limit);
      }

      this.updateMetrics(performance.now() - startTime);

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

  /**
   * 应用查询过滤器
   */
  private applyFilters(
    objects: CanvasObject[],
    params: QueryParams
  ): CanvasObject[] {
    let filtered = objects;

    // ID过滤
    if (params.ids && params.ids.length > 0) {
      filtered = filtered.filter((obj) => params.ids!.includes(obj.id));
    }

    // 类型过滤
    if (params.type) {
      const types = Array.isArray(params.type) ? params.type : [params.type];
      filtered = filtered.filter((obj) => types.includes(obj.type));
    }

    // 标签过滤
    if (params.tags && params.tags.length > 0) {
      filtered = filtered.filter((obj) =>
        obj.metadata.tags?.some((tag: string) => params.tags!.includes(tag))
      );
    }

    // 边界框过滤
    if (params.bounds) {
      const { x, y, width, height } = params.bounds;
      filtered = filtered.filter(
        (obj) =>
          obj.position.x >= x &&
          obj.position.x <= x + width &&
          obj.position.y >= y &&
          obj.position.y <= y + height
      );
    }

    // 时间过滤
    if (params.createdAfter) {
      filtered = filtered.filter(
        (obj) => obj.metadata.createdAt >= params.createdAfter!
      );
    }

    if (params.createdBefore) {
      filtered = filtered.filter(
        (obj) => obj.metadata.createdAt <= params.createdBefore!
      );
    }

    if (params.updatedAfter) {
      filtered = filtered.filter(
        (obj) => obj.metadata.updatedAt >= params.updatedAfter!
      );
    }

    if (params.updatedBefore) {
      filtered = filtered.filter(
        (obj) => obj.metadata.updatedAt <= params.updatedBefore!
      );
    }

    return filtered;
  }

  /**
   * 应用排序
   */
  private applySorting(
    objects: CanvasObject[],
    params: QueryParams
  ): CanvasObject[] {
    if (!params.sortBy) return objects;

    const sortOrder = params.sortOrder === "desc" ? -1 : 1;

    return objects.sort((a, b) => {
      const aValue = this.getNestedValue(a, params.sortBy!);
      const bValue = this.getNestedValue(b, params.sortBy!);

      if (aValue < bValue) return -1 * sortOrder;
      if (aValue > bValue) return 1 * sortOrder;
      return 0;
    });
  }

  /**
   * 更新对象
   */
  async updateObject(
    update: CanvasObjectUpdate
  ): Promise<DataSourceResult<CanvasObject>> {
    const startTime = performance.now();

    try {
      const existingObject = this.objects.get(update.id);

      if (!existingObject) {
        return {
          success: false,
          error: `Object with id ${update.id} not found`,
          timestamp: Date.now(),
        };
      }

      // 检查版本冲突
      if (
        update.metadata?.version &&
        existingObject.metadata.version > update.metadata.version
      ) {
        // 记录冲突
        this.recordConflict(update.id, existingObject, update);

        return {
          success: false,
          error: "Version conflict: local version is newer",
          data: existingObject,
          timestamp: Date.now(),
        };
      }

      // 保存旧状态（用于撤销和冲突解决）
      const oldObject = { ...existingObject };

      // 合并更新
      const updatedObject: CanvasObject = {
        ...existingObject,
        ...update,
        metadata: {
          ...existingObject.metadata,
          ...update.metadata,
          updatedAt: Date.now(),
          version: Math.max(
            existingObject.metadata.version || 1,
            (update.metadata?.version || 0) + 1
          ),
        },
      };

      // 检查是否需要重新索引
      const needsReindex = this.needsReindex(oldObject, updatedObject);

      if (needsReindex) {
        // 移除旧索引
        this.removeObjectFromIndexes(update.id, oldObject);
      }

      // 更新存储
      this.objects.set(update.id, updatedObject);

      if (needsReindex) {
        // 添加新索引
        this.updateIndexesForObject(update.id, updatedObject);
        this.addObjectToChunkIndex(updatedObject);
      }

      // 记录操作
      this.recordOperation("update", [update.id], updatedObject, oldObject);

      this.updateMetrics(performance.now() - startTime);

      // 触发事件
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

  /**
   * 批量更新对象
   */
  async updateObjects(
    updates: CanvasObjectUpdate[]
  ): Promise<DataSourceResult<CanvasObject[]>> {
    const startTime = performance.now();
    const updatedObjects: CanvasObject[] = [];
    const errors: string[] = [];

    for (const update of updates) {
      try {
        const result = await this.updateObject(update);
        if (result.success && result.data) {
          updatedObjects.push(result.data);
        } else {
          errors.push(`Object ${update.id}: ${result.error}`);
        }
      } catch (error) {
        errors.push(
          `Object ${update.id}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    this.updateMetrics(performance.now() - startTime);

    if (errors.length > 0) {
      return {
        success: false,
        error: `Some objects failed to update: ${errors.join(", ")}`,
        data: updatedObjects,
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      data: updatedObjects,
      timestamp: Date.now(),
    };
  }

  /**
   * 删除对象
   */
  async deleteObject(id: string): Promise<DataSourceResult<boolean>> {
    const startTime = performance.now();

    try {
      const object = this.objects.get(id);

      if (!object) {
        return {
          success: false,
          error: `Object with id ${id} not found`,
          timestamp: Date.now(),
        };
      }

      // 保存旧状态（用于撤销）
      const oldObject = { ...object };

      // 从主存储中移除
      this.objects.delete(id);

      // 从所有索引中移除
      this.removeObjectFromIndexes(id, object);

      // 从分块索引中移除
      this.removeObjectFromChunkIndex(id, object);

      // 记录操作
      this.recordOperation("delete", [id], null, oldObject);

      this.updateMetrics(performance.now() - startTime);

      // 触发事件
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

  /**
   * 批量删除对象
   */
  async deleteObjects(ids: string[]): Promise<DataSourceResult<boolean>> {
    const startTime = performance.now();
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const result = await this.deleteObject(id);
        if (!result.success) {
          errors.push(`Object ${id}: ${result.error}`);
        }
      } catch (error) {
        errors.push(
          `Object ${id}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    this.updateMetrics(performance.now() - startTime);

    if (errors.length > 0) {
      return {
        success: false,
        error: `Some objects failed to delete: ${errors.join(", ")}`,
        data: errors.length < ids.length, // 部分成功也算成功
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      data: true,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取分块数据
   */
  async getChunkData(
    query: ChunkQuery
  ): Promise<DataSourceResult<CanvasObject[]>> {
    const startTime = performance.now();

    try {
      const chunkId = `${query.chunkX}_${query.chunkY}`;
      const objectIds = this.chunks.get(chunkId);

      if (!objectIds || objectIds.size === 0) {
        return {
          success: true,
          data: [],
          timestamp: Date.now(),
        };
      }

      // 获取分块内的所有对象
      const objects: CanvasObject[] = [];
      objectIds.forEach((id) => {
        const obj = this.objects.get(id);
        if (obj) {
          objects.push(obj);
        }
      });

      // 如果请求简化版本，应用LOD简化
      let resultObjects = objects;
      if (query.simplified && objects.length > 50) {
        resultObjects = this.simplifyObjectsForLOD(objects, query);
      }

      this.updateMetrics(performance.now() - startTime);

      return {
        success: true,
        data: resultObjects,
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

  /**
   * 简化对象以用于LOD
   */
  private simplifyObjectsForLOD(
    objects: CanvasObject[],
    query: ChunkQuery
  ): CanvasObject[] {
    // 根据分块大小和对象数量决定简化级别
    const targetCount = Math.max(50, objects.length * 0.3); // 保留30%或至少50个对象

    // 按重要性排序（简单的实现：按面积和类型）
    const scoredObjects = objects.map((obj) => ({
      obj,
      score: this.calculateObjectImportance(obj),
    }));

    scoredObjects.sort((a, b) => b.score - a.score);

    // 选择最重要的对象
    const selected = scoredObjects
      .slice(0, targetCount)
      .map((item) => item.obj);

    // 简化选中的对象
    return selected.map((obj) => this.createSimplifiedVersion(obj));
  }

  /**
   * 计算对象重要性分数
   */
  private calculateObjectImportance(obj: CanvasObject): number {
    let score = 0;

    // 类型重要性
    switch (obj.type) {
      case "text":
        score += 30;
        break;
      case "image":
        score += 20;
        break;
      case "path":
        score += 15;
        break;
      default:
        score += 10;
    }

    // 大小重要性
    const area = obj.size.x * obj.size.y;
    score += Math.min(area / 1000, 20);

    // 最近修改
    const hoursSinceUpdate =
      (Date.now() - obj.metadata.updatedAt) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 1) score += 10; // 1小时内修改过

    // 用户标记
    if (obj.metadata.important) score += 20;

    return score;
  }

  /**
   * 创建简化版本的对象
   */
  private createSimplifiedVersion(obj: CanvasObject): CanvasObject {
    const simplified = { ...obj };

    // 简化样式
    if (simplified.style) {
      simplified.style.opacity = Math.min(0.8, simplified.style.opacity || 1);
      if (simplified.style.shadow) {
        delete simplified.style.shadow;
      }
      if (simplified.style.stroke && simplified.style.stroke.width > 1) {
        simplified.style.stroke.width = 1;
      }
    }

    // 简化路径
    if (obj.type === "path" && obj.properties.points) {
      if (obj.properties.points.length > 10) {
        // 简化路径点数
        simplified.properties.points = this.simplifyPathPoints(
          obj.properties.points,
          0.5
        );
      }
    }

    // 简化文本
    if (obj.type === "text" && obj.properties.text) {
      if (obj.properties.text.length > 100) {
        simplified.properties.text =
          obj.properties.text.substring(0, 100) + "...";
      }
      if (obj.properties.fontSize && obj.properties.fontSize > 12) {
        simplified.properties.fontSize = 12;
      }
    }

    // 标记为简化版本
    simplified.metadata.simplified = true;
    simplified.metadata.simplifiedAt = Date.now();

    return simplified;
  }

  /**
   * 简化路径点
   */
  private simplifyPathPoints(points: number[], tolerance: number): number[] {
    if (points.length <= 6) return points;

    // 简单的简化：取每隔n个点
    const step = Math.max(2, Math.floor(points.length / 20));
    const simplified: number[] = [];

    for (let i = 0; i < points.length; i += step * 2) {
      if (i < points.length) simplified.push(points[i]);
      if (i + 1 < points.length) simplified.push(points[i + 1]);
    }

    // 确保包含首尾点
    if (simplified[0] !== points[0] || simplified[1] !== points[1]) {
      simplified.unshift(points[1], points[0]);
    }
    if (
      simplified[simplified.length - 2] !== points[points.length - 2] ||
      simplified[simplified.length - 1] !== points[points.length - 1]
    ) {
      simplified.push(points[points.length - 2], points[points.length - 1]);
    }

    return simplified;
  }

  /**
   * 保存分块数据
   */
  async saveChunkData(
    chunkX: number,
    chunkY: number,
    objects: CanvasObject[]
  ): Promise<DataSourceResult<boolean>> {
    const chunkId = `${chunkX}_${chunkY}`;
    const objectIds = new Set<string>();

    // 保存对象
    for (const obj of objects) {
      this.objects.set(obj.id, obj);
      objectIds.add(obj.id);

      // 更新索引
      this.updateIndexesForObject(obj.id, obj);
    }

    // 更新分块索引
    this.chunks.set(chunkId, objectIds);

    return {
      success: true,
      data: true,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取分块元数据
   */
  async getChunkMetadata(
    chunkX: number,
    chunkY: number
  ): Promise<DataSourceResult<any>> {
    const chunkId = `${chunkX}_${chunkY}`;
    const objectIds = this.chunks.get(chunkId);

    return {
      success: true,
      data: {
        chunkId,
        chunkX,
        chunkY,
        objectCount: objectIds ? objectIds.size : 0,
        lastUpdated: Date.now(),
        objects: objectIds ? Array.from(objectIds) : [],
      },
      timestamp: Date.now(),
    };
  }

  /**
   * 更新对象索引
   */
  private updateIndexesForObject(objectId: string, object: CanvasObject): void {
    // 类型索引
    const typeSet = this.typeIndex.get(object.type) || new Set();
    typeSet.add(objectId);
    this.typeIndex.set(object.type, typeSet);

    // 标签索引
    if (object.metadata.tags) {
      object.metadata.tags.forEach((tag: string) => {
        const tagSet = this.tagIndex.get(tag) || new Set();
        tagSet.add(objectId);
        this.tagIndex.set(tag, tagSet);
      });
    }

    // 空间索引（简化的网格索引）
    const gridX = Math.floor(object.position.x / 1000); // 1k网格
    const gridY = Math.floor(object.position.y / 1000);
    const gridKey = `${gridX}_${gridY}`;

    const spatialSet = this.spatialIndex.get(gridKey) || new Set();
    spatialSet.add(objectId);
    this.spatialIndex.set(gridKey, spatialSet);
  }

  /**
   * 从索引中移除对象
   */
  private removeObjectFromIndexes(
    objectId: string,
    object: CanvasObject
  ): void {
    // 类型索引
    const typeSet = this.typeIndex.get(object.type);
    if (typeSet) {
      typeSet.delete(objectId);
    }

    // 标签索引
    if (object.metadata.tags) {
      object.metadata.tags.forEach((tag: string) => {
        const tagSet = this.tagIndex.get(tag);
        if (tagSet) {
          tagSet.delete(objectId);
        }
      });
    }

    // 空间索引
    const gridX = Math.floor(object.position.x / 1000);
    const gridY = Math.floor(object.position.y / 1000);
    const gridKey = `${gridX}_${gridY}`;

    const spatialSet = this.spatialIndex.get(gridKey);
    if (spatialSet) {
      spatialSet.delete(objectId);
    }
  }

  /**
   * 添加对象到分块索引
   */
  private addObjectToChunkIndex(object: CanvasObject): void {
    const chunkSize = 2000; // 与ChunkedCanvas的块大小匹配
    const chunkX = Math.floor(object.position.x / chunkSize);
    const chunkY = Math.floor(object.position.y / chunkSize);
    const chunkId = `${chunkX}_${chunkY}`;

    const objectIds = this.chunks.get(chunkId) || new Set();
    objectIds.add(object.id);
    this.chunks.set(chunkId, objectIds);
  }

  /**
   * 从分块索引中移除对象
   */
  private removeObjectFromChunkIndex(
    objectId: string,
    object: CanvasObject
  ): void {
    const chunkSize = 2000;
    const chunkX = Math.floor(object.position.x / chunkSize);
    const chunkY = Math.floor(object.position.y / chunkSize);
    const chunkId = `${chunkX}_${chunkY}`;

    const objectIds = this.chunks.get(chunkId);
    if (objectIds) {
      objectIds.delete(objectId);
      if (objectIds.size === 0) {
        this.chunks.delete(chunkId);
      }
    }
  }

  /**
   * 检查对象是否需要重新索引
   */
  private needsReindex(
    oldObject: CanvasObject,
    newObject: CanvasObject
  ): boolean {
    return (
      oldObject.type !== newObject.type ||
      oldObject.position.x !== newObject.position.x ||
      oldObject.position.y !== newObject.position.y ||
      JSON.stringify(oldObject.metadata.tags) !==
        JSON.stringify(newObject.metadata.tags)
    );
  }

  /**
   * 记录操作历史
   */
  private recordOperation(
    type: OperationRecord["type"],
    targetIds: string[],
    data?: any,
    previousState?: any
  ): void {
    const record: OperationRecord = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      targetIds,
      data,
      timestamp: Date.now(),
      author: "user",
      version: 1,
      previousState,
    };

    this.operationHistory.push(record);

    // 限制历史记录大小
    if (this.operationHistory.length > 1000) {
      this.operationHistory = this.operationHistory.slice(-500);
    }

    this.metrics.totalOperations++;
  }

  /**
   * 记录冲突
   */
  private recordConflict(
    objectId: string,
    local: CanvasObject,
    remote: any
  ): void {
    const conflictId = `conflict_${objectId}_${Date.now()}`;

    this.conflicts.set(conflictId, {
      id: conflictId,
      objectId,
      local,
      remote,
      detectedAt: Date.now(),
      resolved: false,
    });

    this.syncState.conflicts++;

    this.emitEvent("conflict-detected", {
      conflictId,
      objectId,
      local,
      remote,
    });
  }

  /**
   * 获取对象历史
   */
  async getObjectHistory(
    id: string,
    limit?: number
  ): Promise<DataSourceResult<OperationRecord[]>> {
    const history = this.operationHistory
      .filter((record) => record.targetIds.includes(id))
      .sort((a, b) => b.timestamp - a.timestamp);

    const result = limit ? history.slice(0, limit) : history;

    return {
      success: true,
      data: result,
      timestamp: Date.now(),
    };
  }

  /**
   * 撤销操作
   */
  async undo(operationId?: string): Promise<DataSourceResult<CanvasObject[]>> {
    try {
      let operation: OperationRecord | undefined;

      if (operationId) {
        // 撤销指定操作
        operation = this.operationHistory.find((op) => op.id === operationId);
      } else {
        // 撤销最后一个操作
        operation = this.operationHistory[this.operationHistory.length - 1];
      }

      if (!operation) {
        return {
          success: false,
          error: "No operation to undo",
          timestamp: Date.now(),
        };
      }

      const restoredObjects: CanvasObject[] = [];

      switch (operation.type) {
        case "create":
          // 删除创建的对象
          for (const id of operation.targetIds) {
            await this.deleteObject(id);
          }
          break;

        case "update":
          // 恢复之前的版本
          if (operation.previousState) {
            for (const id of operation.targetIds) {
              const oldObject = operation.previousState;
              await this.updateObject({
                id,
                ...oldObject,
                metadata: {
                  ...oldObject.metadata,
                  version: oldObject.metadata.version + 1,
                  updatedAt: Date.now(),
                },
              });
              restoredObjects.push(oldObject);
            }
          }
          break;

        case "delete":
          // 重新创建删除的对象
          if (operation.previousState) {
            for (const oldObject of Array.isArray(operation.previousState)
              ? operation.previousState
              : [operation.previousState]) {
              await this.createObject(oldObject);
              restoredObjects.push(oldObject);
            }
          }
          break;
      }

      // 从历史中移除这个操作
      this.operationHistory = this.operationHistory.filter(
        (op) => op.id !== operation!.id
      );

      return {
        success: true,
        data: restoredObjects,
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

  /**
   * 获取操作历史
   */
  async getOperationHistory(
    limit?: number,
    offset?: number
  ): Promise<DataSourceResult<OperationRecord[]>> {
    let history = [...this.operationHistory].reverse(); // 最新的在前

    if (offset) {
      history = history.slice(offset);
    }

    if (limit) {
      history = history.slice(0, limit);
    }

    return {
      success: true,
      data: history,
      timestamp: Date.now(),
    };
  }

  /**
   * 执行批量操作
   */
  async executeBatch(
    operations: OperationRecord[]
  ): Promise<DataSourceResult<boolean>> {
    try {
      for (const operation of operations) {
        switch (operation.type) {
          case "create":
            if (operation.data) {
              await this.createObject(operation.data);
            }
            break;

          case "update":
            if (operation.data) {
              await this.updateObject(operation.data);
            }
            break;

          case "delete":
            for (const id of operation.targetIds) {
              await this.deleteObject(id);
            }
            break;
        }
      }

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

  /**
   * 导出数据
   */
  async exportData(options?: any): Promise<DataSourceResult<any>> {
    const data = {
      version: "1.0",
      exportedAt: Date.now(),
      objects: Array.from(this.objects.values()),
      operationHistory: this.operationHistory.slice(-100), // 最近100个操作
      states: Object.fromEntries(this.states),
      metadata: {
        totalObjects: this.objects.size,
        totalOperations: this.metrics.totalOperations,
        generator: "MemoryDataSource",
      },
    };

    return {
      success: true,
      data,
      timestamp: Date.now(),
    };
  }

  /**
   * 导入数据
   */
  async importData(
    data: any,
    options?: any
  ): Promise<DataSourceResult<CanvasObject[]>> {
    try {
      if (!data || !data.objects || !Array.isArray(data.objects)) {
        return {
          success: false,
          error: "Invalid data format",
          timestamp: Date.now(),
        };
      }

      // 清空现有数据（如果指定）
      if (options?.clearExisting) {
        this.objects.clear();
        this.chunks.clear();
        this.operationHistory = [];
        this.states.clear();
        this.initializeIndexes();
      }

      // 导入对象
      const importedObjects: CanvasObject[] = [];
      const errors: string[] = [];

      for (const obj of data.objects) {
        try {
          const result = await this.createObject(obj);
          if (result.success && result.data) {
            importedObjects.push(result.data);
          } else {
            errors.push(`Object ${obj.id}: ${result.error}`);
          }
        } catch (error) {
          errors.push(
            `Object ${obj.id}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }

      // 导入操作历史
      if (data.operationHistory && Array.isArray(data.operationHistory)) {
        this.operationHistory.push(...data.operationHistory);
      }

      // 导入状态
      if (data.states && typeof data.states === "object") {
        Object.entries(data.states).forEach(([key, value]) => {
          this.states.set(key, value);
        });
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: `Some objects failed to import: ${errors.join(", ")}`,
          data: importedObjects,
          timestamp: Date.now(),
        };
      }

      return {
        success: true,
        data: importedObjects,
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

  /**
   * 保存状态
   */
  async saveState(state: any): Promise<DataSourceResult<any>> {
    const stateId = `state_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const fullState = {
      ...state,
      id: stateId,
      createdAt: Date.now(),
      metadata: {
        objectCount: this.objects.size,
        operationCount: this.operationHistory.length,
        ...state.metadata,
      },
    };

    this.states.set(stateId, fullState);

    return {
      success: true,
      data: {
        id: stateId,
        ...fullState,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * 加载状态
   */
  async loadState(id?: string): Promise<DataSourceResult<any>> {
    if (id) {
      const state = this.states.get(id);
      if (!state) {
        return {
          success: false,
          error: `State with id ${id} not found`,
          timestamp: Date.now(),
        };
      }

      return {
        success: true,
        data: state,
        timestamp: Date.now(),
      };
    }

    // 返回最新的状态
    const states = Array.from(this.states.values());
    if (states.length === 0) {
      return {
        success: false,
        error: "No saved states found",
        timestamp: Date.now(),
      };
    }

    const latestState = states.sort((a, b) => b.createdAt - a.createdAt)[0];

    return {
      success: true,
      data: latestState,
      timestamp: Date.now(),
    };
  }

  /**
   * 开始同步（内存数据源通常不需要同步）
   */
  async startSync(): Promise<DataSourceResult<SyncState>> {
    this.syncState.lastSyncTime = Date.now();
    this.syncState.pendingOperations = 0;

    return {
      success: true,
      data: this.syncState,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取同步状态
   */
  async getSyncState(): Promise<DataSourceResult<SyncState>> {
    return {
      success: true,
      data: this.syncState,
      timestamp: Date.now(),
    };
  }

  /**
   * 解决冲突
   */
  async resolveConflict(
    conflictId: string,
    resolution: ConflictResolution
  ): Promise<DataSourceResult<void>> {
    const conflict = this.conflicts.get(conflictId);

    if (!conflict) {
      return {
        success: false,
        error: `Conflict with id ${conflictId} not found`,
        timestamp: Date.now(),
      };
    }

    // 应用解决方案
    if (resolution.strategy === "last-write-wins") {
      const winner =
        resolution.resolved ||
        (resolution.ours.metadata.updatedAt >
        resolution.theirs.metadata.updatedAt
          ? resolution.ours
          : resolution.theirs);

      await this.updateObject({
        id: conflict.objectId,
        ...winner,
        metadata: {
          ...winner.metadata,
          updatedAt: Date.now(),
          version: winner.metadata.version + 1,
        },
      });
    } else if (resolution.strategy === "merge") {
      // 简单的合并策略：使用较新的属性
      const merged = { ...resolution.ours, ...resolution.theirs };
      merged.metadata = {
        ...resolution.ours.metadata,
        ...resolution.theirs.metadata,
        updatedAt: Date.now(),
        version:
          Math.max(
            resolution.ours.metadata.version,
            resolution.theirs.metadata.version
          ) + 1,
        mergedAt: Date.now(),
      };

      await this.updateObject({
        id: conflict.objectId,
        ...merged,
      });
    }

    // 标记冲突为已解决
    conflict.resolved = true;
    conflict.resolvedAt = Date.now();
    conflict.resolution = resolution;

    this.syncState.conflicts--;

    return {
      success: true,
      timestamp: Date.now(),
    };
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<DataSourceResult<void>> {
    // 清理过期的缓存（如果有的话）
    // 内存数据源通常不需要清理

    return {
      success: true,
      timestamp: Date.now(),
    };
  }

  /**
   * 销毁数据源
   */
  async destroy(): Promise<DataSourceResult<void>> {
    // 清空所有数据
    this.objects.clear();
    this.chunks.clear();
    this.typeIndex.clear();
    this.tagIndex.clear();
    this.spatialIndex.clear();
    this.operationHistory = [];
    this.states.clear();
    this.conflicts.clear();

    // 清理事件监听器
    await super.destroy();

    return {
      success: true,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): any {
    return {
      objects: {
        total: this.objects.size,
        byType: this.getObjectCountByType(),
        byChunk: this.chunks.size,
      },
      operations: {
        total: this.metrics.totalOperations,
        historySize: this.operationHistory.length,
      },
      performance: {
        cacheHitRate:
          this.metrics.cacheHits /
            (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
        averageQueryTime: this.metrics.averageQueryTime,
      },
      sync: this.syncState,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * 按类型统计对象数量
   */
  private getObjectCountByType(): Record<string, number> {
    const counts: Record<string, number> = {};

    this.typeIndex.forEach((set, type) => {
      counts[type] = set.size;
    });

    return counts;
  }

  /**
   * 估计内存使用量
   */
  private estimateMemoryUsage(): number {
    let total = 0;

    // 对象存储
    this.objects.forEach((obj, id) => {
      total += id.length * 2; // ID
      total += JSON.stringify(obj).length * 2; // 对象数据（粗略估计）
    });

    // 索引存储
    const indexes = [
      this.typeIndex,
      this.tagIndex,
      this.spatialIndex,
      this.chunks,
    ];
    indexes.forEach((index) => {
      index.forEach((set, key) => {
        total += key.length * 2;
        set.forEach((value) => {
          total += value.length * 2;
        });
      });
    });

    // 操作历史
    this.operationHistory.forEach((record) => {
      total += JSON.stringify(record).length * 2;
    });

    return total; // 字节数
  }

  /**
   * 工具方法
   */
  private generateObjectId(): string {
    return `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  private updateMetrics(queryTime: number): void {
    this.metrics.averageQueryTime =
      (this.metrics.averageQueryTime * (this.metrics.totalOperations - 1) +
        queryTime) /
      this.metrics.totalOperations;
  }
}
