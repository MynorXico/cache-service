/**
 * Size-aware LRU (Least Recently Used) cache implementation
 * Tracks both entry count and memory usage for eviction decisions
 */

export interface LRUNode<T> {
  key: string;
  value: T;
  sizeBytes: number;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

export class SizeAwareLRU<T> {
  private capacity: number;
  private maxSizeBytes: number;
  private currentSizeBytes: number = 0;
  private size: number = 0;
  private cache = new Map<string, LRUNode<T>>();
  private head: LRUNode<T>;
  private tail: LRUNode<T>;

  constructor(capacity: number = Infinity, maxSizeBytes: number = Infinity) {
    this.capacity = capacity;
    this.maxSizeBytes = maxSizeBytes;

    // Create dummy head and tail nodes
    this.head = {
      key: '',
      value: null as T,
      sizeBytes: 0,
      prev: null,
      next: null,
    };
    this.tail = {
      key: '',
      value: null as T,
      sizeBytes: 0,
      prev: null,
      next: null,
    };

    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get current number of entries
   */
  get length(): number {
    return this.size;
  }

  /**
   * Get current memory usage in bytes
   */
  get memoryBytes(): number {
    return this.currentSizeBytes;
  }

  /**
   * Check if the cache is at capacity (either count or size)
   */
  get isFull(): boolean {
    return this.size >= this.capacity || this.currentSizeBytes >= this.maxSizeBytes;
  }

  /**
   * Get a value and mark it as recently used
   */
  get(key: string): T | undefined {
    const node = this.cache.get(key);
    if (!node) {
      return undefined;
    }

    // Move to front (most recently used)
    this.moveToFront(node);
    return node.value;
  }

  /**
   * Set a value, evicting old entries if necessary
   */
  set(key: string, value: T, sizeBytes: number): T[] {
    const evicted: T[] = [];
    const existingNode = this.cache.get(key);

    if (existingNode) {
      // Update existing entry
      this.currentSizeBytes -= existingNode.sizeBytes;
      existingNode.value = value;
      existingNode.sizeBytes = sizeBytes;
      this.currentSizeBytes += sizeBytes;
      this.moveToFront(existingNode);
    } else {
      // Create new entry
      const newNode: LRUNode<T> = {
        key,
        value,
        sizeBytes,
        prev: null,
        next: null,
      };

      this.cache.set(key, newNode);
      this.addToFront(newNode);
      this.size++;
      this.currentSizeBytes += sizeBytes;
    }

    // Evict entries if over capacity
    while (this.size > this.capacity || this.currentSizeBytes > this.maxSizeBytes) {
      const evictedValue = this.evictLRU();
      if (evictedValue !== undefined) {
        evicted.push(evictedValue);
      } else {
        break; // Safety check
      }
    }

    return evicted;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }

    this.removeNode(node);
    this.cache.delete(key);
    this.size--;
    this.currentSizeBytes -= node.sizeBytes;
    return true;
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.size = 0;
    this.currentSizeBytes = 0;
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get all keys in LRU order (least recently used first)
   */
  keys(): string[] {
    const keys: string[] = [];
    let current = this.tail.prev;

    while (current && current !== this.head) {
      keys.push(current.key);
      current = current.prev;
    }

    return keys;
  }

  /**
   * Get statistics about the LRU cache
   */
  getStats(): { size: number; memoryBytes: number; capacity: number; maxSizeBytes: number } {
    return {
      size: this.size,
      memoryBytes: this.currentSizeBytes,
      capacity: this.capacity,
      maxSizeBytes: this.maxSizeBytes,
    };
  }

  private evictLRU(): T | undefined {
    const lru = this.tail.prev;
    if (!lru || lru === this.head) {
      return undefined;
    }

    this.removeNode(lru);
    this.cache.delete(lru.key);
    this.size--;
    this.currentSizeBytes -= lru.sizeBytes;
    return lru.value;
  }

  private moveToFront(node: LRUNode<T>): void {
    this.removeNode(node);
    this.addToFront(node);
  }

  private addToFront(node: LRUNode<T>): void {
    node.prev = this.head;
    node.next = this.head.next;

    if (this.head.next) {
      this.head.next.prev = node;
    }
    this.head.next = node;
  }

  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
  }
}
