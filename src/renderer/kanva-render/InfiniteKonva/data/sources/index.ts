// src/data/sources/index.ts
// 导出所有数据源

// 基类
export { CanvasDataSource } from "./base/CanvasDataSource";

// 本地数据源
export { LocalStorageDataSource } from "./local/LocalStorageDataSource";
export { IndexedDBDataSource } from "./local/IndexedDBDataSource";
export { MemoryDataSource } from "./local/MemoryDataSource";

// 远程数据源
export { RestAPIDataSource } from "./remote/RestAPIDataSource";
export { WebSocketDataSource } from "./remote/WebSocketDataSource";
export { GraphQLDataSource } from "./remote/GraphQLDataSource";

// 混合数据源
export { HybridDataSource } from "./hybrid/HybridDataSource";
export { CachedRemoteDataSource } from "./hybrid/CachedRemoteDataSource";
export { OfflineFirstDataSource } from "./hybrid/OfflineFirstDataSource";

// 适配器
export { YjsDataSource } from "./adapters/YjsDataSource";
export { CRDTDataSource } from "./adapters/CRDTDataSource";
export { FileSystemDataSource } from "./adapters/FileSystemDataSource";

// 类型
export type {
  ICanvasDataSource,
  DataSourceConfig,
  DataSourceResult,
  QueryParams,
  QueryResult,
  ChunkQuery,
  OperationRecord,
  SyncState,
  ConflictResolution,
} from "../../types/data-source";
