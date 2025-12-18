// src/data/sources/local/LocalStorageDataSource.ts
import { CanvasDataSource } from "../base/CanvasDataSource";
import CanvasObject, {
  CanvasObjectCreate,
  CanvasObjectUpdate,
} from "../../../types/canvas-object";
import {
  DataSourceResult,
  QueryParams,
  QueryResult,
  ChunkQuery,
  DataSourceConfig,
} from "../../../types/data-source";

/**
 * 基于 localStorage 的数据源实现
 */

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
