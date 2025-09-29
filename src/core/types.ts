/**
 * Core type definitions for the cache service
 */

export type ValueType = 'string' | 'number' | 'boolean' | 'json' | 'bytes';

export type CacheValue = string | number | boolean | object | Buffer;

export interface CacheEntry {
  key: string;
  value: CacheValue;
  type: ValueType;
  version: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  sizeBytes: number;
}

export interface CacheMetadata {
  version: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  ttlSec?: number;
}

export interface SetRequest {
  value: CacheValue;
  type: ValueType;
  ttlSec?: number;
}

export interface SetResponse {
  version: string;
  expiresAt?: string;
}

export interface GetResponse {
  value: CacheValue;
  type: ValueType;
  version: string;
  ttlSec?: number;
  expiresAt?: string;
}

export interface BatchGetRequest {
  keys: string[];
}

export interface BatchGetResponse {
  hits: Array<{
    key: string;
    value: CacheValue;
    type: ValueType;
    version: string;
  }>;
  misses: string[];
}

export interface BatchSetRequest {
  items: Array<{
    key: string;
    value: CacheValue;
    type: ValueType;
    ttlSec?: number;
  }>;
}

export interface BatchSetResponse {
  results: Array<{
    key: string;
    status: 'created' | 'updated' | 'skipped' | 'error';
    version?: string;
    error?: string;
  }>;
}

export interface BatchDeleteRequest {
  keys: string[];
}

export interface BatchDeleteResponse {
  results: Array<{
    key: string;
    status: 'deleted' | 'missing' | 'error';
    error?: string;
  }>;
}

export interface IncrRequest {
  key: string;
  delta: number;
}

export interface IncrResponse {
  value: number;
  version: string;
}

export interface ErrorResponse {
  error: {
    code:
      | 'CONFLICT'
      | 'NOT_FOUND'
      | 'BAD_REQUEST'
      | 'PAYLOAD_TOO_LARGE'
      | 'UNAUTHORIZED'
      | 'INTERNAL';
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ShardOperation {
  type: 'set' | 'delete' | 'expire' | 'evict';
  key: string;
  entry?: CacheEntry;
  ifMatch?: string;
  ifNoneMatch?: boolean;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export interface ShardStats {
  entries: number;
  memoryBytes: number;
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  expirations: number;
}

export interface CacheConfig {
  port: number;
  apiToken: string;
  readRequiresAuth: boolean;
  shards: number;
  maxItemBytes: number;
  memoryBudgetBytes?: number;
  requestTimeoutMs: number;
  maxInflight: number;
  maxShardMailbox: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableSwagger: boolean;
}
