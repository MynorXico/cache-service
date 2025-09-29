/**
 * Main cache store that coordinates multiple shards
 * Provides the primary API for cache operations
 */

import { CacheShard } from './shard';
import { getShardForKey } from './hashing';
import {
  BatchDeleteRequest,
  BatchDeleteResponse,
  BatchGetRequest,
  BatchGetResponse,
  BatchSetRequest,
  BatchSetResponse,
  CacheEntry,
  ShardStats,
} from './types';

export class CacheStore {
  private readonly shards: CacheShard[];
  private readonly numShards: number;
  private readonly maxInflight: number;
  private currentInflight = 0;

  constructor(
    numShards: number,
    maxItemBytes: number,
    memoryBudgetBytes?: number,
    maxInflight: number = 1000,
    maxShardMailbox: number = 1000
  ) {
    this.numShards = numShards;
    this.maxInflight = maxInflight;
    this.shards = [];

    // Create shards with per-shard memory budget
    const perShardMemoryBudget = memoryBudgetBytes
      ? Math.floor(memoryBudgetBytes / numShards)
      : undefined;

    for (let i = 0; i < numShards; i++) {
      this.shards.push(new CacheShard(i, maxItemBytes, perShardMemoryBudget, maxShardMailbox));
    }
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<CacheEntry | undefined> {
    this.checkBackpressure();

    try {
      this.currentInflight++;
      const shard = this.getShardForKey(key);
      return shard.get(key);
    } finally {
      this.currentInflight--;
    }
  }

  /**
   * Set a key-value pair
   */
  async set(
    key: string,
    value: unknown,
    ttlSec?: number,
    ifMatch?: string,
    ifNoneMatch?: boolean
  ): Promise<{ version: string; expiresAt?: number }> {
    this.checkBackpressure();

    try {
      this.currentInflight++;
      const shard = this.getShardForKey(key);
      return await shard.set(key, value, ttlSec, ifMatch, ifNoneMatch);
    } finally {
      this.currentInflight--;
    }
  }

  /**
   * Delete a key
   */
  async delete(key: string, ifMatch?: string): Promise<boolean> {
    this.checkBackpressure();

    try {
      this.currentInflight++;
      const shard = this.getShardForKey(key);
      return await shard.delete(key, ifMatch);
    } finally {
      this.currentInflight--;
    }
  }

  /**
   * Increment a numeric value atomically
   */
  async increment(key: string, delta: number): Promise<{ value: number; version: string }> {
    this.checkBackpressure();

    try {
      this.currentInflight++;
      const shard = this.getShardForKey(key);
      return await shard.increment(key, delta);
    } finally {
      this.currentInflight--;
    }
  }

  /**
   * Batch get multiple keys
   */
  async batchGet(request: BatchGetRequest): Promise<BatchGetResponse> {
    this.checkBackpressure();

    try {
      this.currentInflight++;

      const hits: BatchGetResponse['hits'] = [];
      const misses: string[] = [];

      // Group keys by shard for efficient processing
      const keysByShard = new Map<number, string[]>();

      for (const key of request.keys) {
        const shardId = getShardForKey(key, this.numShards);
        if (!keysByShard.has(shardId)) {
          keysByShard.set(shardId, []);
        }
        keysByShard.get(shardId)!.push(key);
      }

      // Process each shard's keys
      for (const [shardId, keys] of keysByShard) {
        const shard = this.shards[shardId];

        for (const key of keys) {
          const entry = shard.get(key);
          if (entry) {
            hits.push({
              key,
              value: entry.value,
              type: entry.type,
              version: entry.version,
            });
          } else {
            misses.push(key);
          }
        }
      }

      return { hits, misses };
    } finally {
      this.currentInflight--;
    }
  }

  /**
   * Batch set multiple keys
   */
  async batchSet(request: BatchSetRequest): Promise<BatchSetResponse> {
    this.checkBackpressure();

    try {
      this.currentInflight++;

      const results: BatchSetResponse['results'] = [];

      // Group items by shard
      const itemsByShard = new Map<number, typeof request.items>();

      for (const item of request.items) {
        const shardId = getShardForKey(item.key, this.numShards);
        if (!itemsByShard.has(shardId)) {
          itemsByShard.set(shardId, []);
        }
        itemsByShard.get(shardId)!.push(item);
      }

      // Process each shard's items
      const promises: Promise<void>[] = [];

      for (const [shardId, items] of itemsByShard) {
        const shard = this.shards[shardId];

        for (const item of items) {
          const promise = shard
            .set(item.key, item.value, item.ttlSec)
            .then((result) => {
              results.push({
                key: item.key,
                status: 'created', // We don't track if it was an update vs create in this simple version
                version: result.version,
              });
            })
            .catch((error) => {
              results.push({
                key: item.key,
                status: 'error',
                error: error.message,
              });
            });

          promises.push(promise);
        }
      }

      await Promise.all(promises);

      // Sort results to match input order
      const keyOrder = new Map(request.items.map((item, index) => [item.key, index]));
      results.sort((a, b) => (keyOrder.get(a.key) || 0) - (keyOrder.get(b.key) || 0));

      return { results };
    } finally {
      this.currentInflight--;
    }
  }

  /**
   * Batch delete multiple keys
   */
  async batchDelete(request: BatchDeleteRequest): Promise<BatchDeleteResponse> {
    this.checkBackpressure();

    try {
      this.currentInflight++;

      const results: BatchDeleteResponse['results'] = [];

      // Group keys by shard
      const keysByShard = new Map<number, string[]>();

      for (const key of request.keys) {
        const shardId = getShardForKey(key, this.numShards);
        if (!keysByShard.has(shardId)) {
          keysByShard.set(shardId, []);
        }
        keysByShard.get(shardId)!.push(key);
      }

      // Process each shard's keys
      const promises: Promise<void>[] = [];

      for (const [shardId, keys] of keysByShard) {
        const shard = this.shards[shardId];

        for (const key of keys) {
          const promise = shard
            .delete(key)
            .then((deleted) => {
              results.push({
                key,
                status: deleted ? 'deleted' : 'missing',
              });
            })
            .catch((error) => {
              results.push({
                key,
                status: 'error',
                error: error.message,
              });
            });

          promises.push(promise);
        }
      }

      await Promise.all(promises);

      // Sort results to match input order
      const keyOrder = new Map(request.keys.map((key, index) => [key, index]));
      results.sort((a, b) => (keyOrder.get(a.key) || 0) - (keyOrder.get(b.key) || 0));

      return { results };
    } finally {
      this.currentInflight--;
    }
  }

  /**
   * Get aggregated statistics from all shards
   */
  getStats(): {
    shards: ShardStats[];
    total: ShardStats;
    inflight: number;
    imbalance: number;
  } {
    const shardStats = this.shards.map((shard) => shard.getStats());

    const total = shardStats.reduce(
      (acc, stats) => ({
        entries: acc.entries + stats.entries,
        memoryBytes: acc.memoryBytes + stats.memoryBytes,
        hits: acc.hits + stats.hits,
        misses: acc.misses + stats.misses,
        sets: acc.sets + stats.sets,
        deletes: acc.deletes + stats.deletes,
        evictions: acc.evictions + stats.evictions,
        expirations: acc.expirations + stats.expirations,
      }),
      {
        entries: 0,
        memoryBytes: 0,
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        evictions: 0,
        expirations: 0,
      }
    );

    // Calculate shard imbalance (coefficient of variation of entry counts)
    const avgEntries = total.entries / this.numShards;
    const variance =
      shardStats.reduce((acc, stats) => acc + Math.pow(stats.entries - avgEntries, 2), 0) /
      this.numShards;
    const imbalance = avgEntries > 0 ? Math.sqrt(variance) / avgEntries : 0;

    return {
      shards: shardStats,
      total,
      inflight: this.currentInflight,
      imbalance,
    };
  }

  /**
   * Shutdown all shards
   */
  shutdown(): void {
    for (const shard of this.shards) {
      shard.shutdown();
    }
  }

  private getShardForKey(key: string): CacheShard {
    const shardId = getShardForKey(key, this.numShards);

    // Defensive bounds checking
    if (shardId < 0 || shardId >= this.numShards || !this.shards[shardId]) {
      throw new Error(
        `Invalid shard ID ${shardId} for key "${key}". NumShards: ${this.numShards}, Shards length: ${this.shards.length}`
      );
    }

    return this.shards[shardId];
  }

  private checkBackpressure(): void {
    if (this.currentInflight >= this.maxInflight) {
      const error = new Error('Service overloaded');
      (error as any).statusCode = 503;
      (error as any).retryAfter = 0;
      throw error;
    }
  }
}
