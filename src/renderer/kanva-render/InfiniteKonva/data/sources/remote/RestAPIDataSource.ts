// src/data/sources/remote/RestAPIDataSource.ts
import { CanvasDataSource } from "../base/CanvasDataSource";
import {
  DataSourceResult,
  QueryParams,
  QueryResult,
  ChunkQuery,
  DataSourceConfig,
} from "../../../types/data-source";

import CanvasObject, {
  CanvasObjectCreate,
  CanvasObjectUpdate,
} from "../../../types/canvas-object";

/**
 * 基于 REST API 的远程数据源
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
