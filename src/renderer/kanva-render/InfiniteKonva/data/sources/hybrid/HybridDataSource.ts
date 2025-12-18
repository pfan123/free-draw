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
