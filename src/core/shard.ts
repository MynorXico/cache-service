/**
 * Shard implementation with actor model for concurrency control
 * Each shard manages its own data, LRU, and TTL heap independently
 */

import { ulid } from 'ulid';
import { SizeAwareLRU } from './lru';
import { MinHeap } from './minheap';
import { CacheEntry, ShardOperation, ShardStats } from './types';
import { BadRequestError, ConflictError, PayloadTooLargeError } from './errors';
import { calculateValueSize, validateInferredValue } from './validators';

export class CacheShard {
  private readonly shardId: number;
  private readonly entries = new Map<string, CacheEntry>();
  private readonly lru: SizeAwareLRU<string>;
  private readonly ttlHeap = new MinHeap();
  private readonly operationQueue: ShardOperation[] = [];
  private readonly maxItemBytes: number;
  private readonly maxMailboxSize: number;
  private isProcessing = false;
  private stats: ShardStats = {
    entries: 0,
    memoryBytes: 0,
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    expirations: 0,
  };

  // Background expiration timer
  private expirationTimer?: NodeJS.Timeout;
  private readonly expirationIntervalMs = 1000; // Check every second

  constructor(
    shardId: number,
    maxItemBytes: number,
    memoryBudgetBytes?: number,
    maxMailboxSize: number = 1000
  ) {
    this.shardId = shardId;
    this.maxItemBytes = maxItemBytes;
    this.maxMailboxSize = maxMailboxSize;

    // Initialize LRU with memory budget if specified
    this.lru = new SizeAwareLRU<string>(
      Infinity, // No entry count limit
      memoryBudgetBytes || Infinity
    );

    // Start background expiration process
    this.startExpirationTimer();
  }

  /**
   * Get current shard statistics
   */
  getStats(): ShardStats {
    return {
      ...this.stats,
      entries: this.entries.size,
      memoryBytes: this.lru.memoryBytes,
    };
  }

  /**
   * Fast-path read operation (no queuing for reads)
   */
  get(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      // Lazy expiration - remove expired entry
      this.deleteEntry(key);
      this.stats.misses++;
      this.stats.expirations++;
      return undefined;
    }

    // Update LRU
    this.lru.get(key);
    this.stats.hits++;
    return entry;
  }

  /**
   * Queue a mutation operation
   */
  async enqueueOperation(operation: ShardOperation): Promise<unknown> {
    if (this.operationQueue.length >= this.maxMailboxSize) {
      throw new Error('Shard mailbox full');
    }

    return new Promise((resolve, reject) => {
      operation.resolve = resolve;
      operation.reject = reject;
      this.operationQueue.push(operation);
      this.processOperations();
    });
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
    return this.enqueueOperation({
      type: 'set',
      key,
      entry: this.createEntry(key, value, ttlSec),
      ifMatch,
      ifNoneMatch,
      resolve: () => {},
      reject: () => {},
    }) as Promise<{ version: string; expiresAt?: number }>;
  }

  /**
   * Delete a key
   */
  async delete(key: string, ifMatch?: string): Promise<boolean> {
    return this.enqueueOperation({
      type: 'delete',
      key,
      ifMatch,
      resolve: () => {},
      reject: () => {},
    }) as Promise<boolean>;
  }

  /**
   * Increment a numeric value atomically
   */
  async increment(key: string, delta: number): Promise<{ value: number; version: string }> {
    return this.enqueueOperation({
      type: 'set',
      key,
      entry: { delta } as any, // Special marker for increment
      resolve: () => {},
      reject: () => {},
    }) as Promise<{ value: number; version: string }>;
  }

  /**
   * Shutdown the shard
   */
  shutdown(): void {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
    }
  }

  private async processOperations(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.operationQueue.length > 0) {
        const operation = this.operationQueue.shift()!;

        try {
          const result = await this.executeOperation(operation);
          operation.resolve(result);
        } catch (error) {
          operation.reject(error as Error);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeOperation(operation: ShardOperation): Promise<unknown> {
    switch (operation.type) {
      case 'set':
        return this.executeSet(operation);
      case 'delete':
        return this.executeDelete(operation);
      case 'expire':
        return this.executeExpire(operation);
      case 'evict':
        return this.executeEvict(operation);
      default:
        throw new Error(`Unknown operation type: ${(operation as any).type}`);
    }
  }

  private executeSet(operation: ShardOperation): { version: string; expiresAt?: number } {
    const { key, entry, ifMatch, ifNoneMatch } = operation;

    // Handle increment operation
    if (entry && 'delta' in entry) {
      return this.executeIncrement(key, (entry as any).delta);
    }

    if (!entry) {
      throw new Error('Entry required for set operation');
    }

    const existingEntry = this.entries.get(key);

    // Check if existing entry has expired
    const now = Date.now();
    const isExpired = existingEntry && existingEntry.expiresAt && existingEntry.expiresAt <= now;

    // If entry is expired, treat it as non-existent for CAS operations
    const effectiveEntry = isExpired ? undefined : existingEntry;

    // Check conditional headers
    if (ifNoneMatch && effectiveEntry) {
      throw new ConflictError('Key already exists', { key });
    }

    if (ifMatch && (!effectiveEntry || effectiveEntry.version !== ifMatch)) {
      throw new ConflictError('Version mismatch', {
        key,
        expected: ifMatch,
        actual: effectiveEntry?.version || null,
      });
    }

    // Check payload size
    if (entry.sizeBytes > this.maxItemBytes) {
      throw new PayloadTooLargeError(
        `Item size ${entry.sizeBytes} exceeds limit ${this.maxItemBytes}`
      );
    }

    // Update or create entry
    const newEntry: CacheEntry = {
      ...entry,
      version: ulid(),
      updatedAt: now,
      createdAt: existingEntry?.createdAt || now,
    };

    this.entries.set(key, newEntry);
    this.stats.sets++;

    // Update LRU and handle evictions
    const evicted = this.lru.set(key, key, newEntry.sizeBytes);
    for (const evictedKey of evicted) {
      this.deleteEntry(evictedKey);
      this.stats.evictions++;
    }

    // Add to TTL heap if has expiration
    if (newEntry.expiresAt) {
      this.ttlHeap.push({
        key,
        expiresAt: newEntry.expiresAt,
        shard: this.shardId,
      });
    }

    return {
      version: newEntry.version,
      expiresAt: newEntry.expiresAt,
    };
  }

  private executeDelete(operation: ShardOperation): boolean {
    const { key, ifMatch } = operation;
    const existingEntry = this.entries.get(key);

    if (!existingEntry) {
      return false;
    }

    // Check conditional header
    if (ifMatch && existingEntry.version !== ifMatch) {
      throw new ConflictError('Version mismatch', {
        key,
        expected: ifMatch,
        actual: existingEntry.version,
      });
    }

    this.deleteEntry(key);
    this.stats.deletes++;
    return true;
  }

  private executeIncrement(key: string, delta: number): { value: number; version: string } {
    const existingEntry = this.entries.get(key);
    let currentValue = 0;

    if (existingEntry) {
      if (existingEntry.type !== 'number') {
        throw new BadRequestError(
          `Cannot increment non-numeric value. Key '${key}' contains ${existingEntry.type} value, but increment requires a number.`
        );
      }
      currentValue = existingEntry.value as number;
    }

    const newValue = currentValue + delta;
    const now = Date.now();

    const newEntry: CacheEntry = {
      key,
      value: newValue,
      type: 'number',
      version: ulid(),
      createdAt: existingEntry?.createdAt || now,
      updatedAt: now,
      sizeBytes: 8, // 64-bit number
    };

    this.entries.set(key, newEntry);
    this.lru.set(key, key, newEntry.sizeBytes);
    this.stats.sets++;

    return {
      value: newValue,
      version: newEntry.version,
    };
  }

  private executeExpire(operation: ShardOperation): boolean {
    return this.deleteEntry(operation.key);
  }

  private executeEvict(operation: ShardOperation): boolean {
    return this.deleteEntry(operation.key);
  }

  private deleteEntry(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }

    this.entries.delete(key);
    this.lru.delete(key);
    return true;
  }

  private createEntry(key: string, value: unknown, ttlSec?: number): CacheEntry {
    const { value: validatedValue, type } = validateInferredValue(value);
    const sizeBytes = calculateValueSize(validatedValue, type);
    const now = Date.now();
    const expiresAt = ttlSec ? now + ttlSec * 1000 : undefined;

    return {
      key,
      value: validatedValue,
      type,
      version: '', // Will be set during execution
      createdAt: now,
      updatedAt: now,
      expiresAt,
      sizeBytes,
    };
  }

  private startExpirationTimer(): void {
    this.expirationTimer = setInterval(() => {
      this.processExpirations();
    }, this.expirationIntervalMs);
  }

  private processExpirations(): void {
    const now = Date.now();
    const expired = this.ttlHeap.popExpired(now);

    for (const entry of expired) {
      if (this.entries.has(entry.key)) {
        this.enqueueOperation({
          type: 'expire',
          key: entry.key,
          resolve: () => {},
          reject: () => {},
        });
      }
    }
  }
}
