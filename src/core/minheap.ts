/**
 * Min-heap implementation for TTL-based expiration
 * Efficiently tracks entries by expiration time
 */

export interface HeapEntry {
  key: string;
  expiresAt: number;
  shard: number;
}

export class MinHeap {
  private heap: HeapEntry[] = [];

  /**
   * Get the number of entries in the heap
   */
  get size(): number {
    return this.heap.length;
  }

  /**
   * Check if the heap is empty
   */
  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Add an entry to the heap
   */
  push(entry: HeapEntry): void {
    this.heap.push(entry);
    this.heapifyUp(this.heap.length - 1);
  }

  /**
   * Remove and return the entry with the earliest expiration time
   */
  pop(): HeapEntry | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    if (this.heap.length === 1) {
      return this.heap.pop();
    }

    const min = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.heapifyDown(0);
    return min;
  }

  /**
   * Peek at the entry with the earliest expiration time without removing it
   */
  peek(): HeapEntry | undefined {
    return this.heap.length > 0 ? this.heap[0] : undefined;
  }

  /**
   * Remove all entries that have expired (expiresAt <= now)
   */
  popExpired(now: number): HeapEntry[] {
    const expired: HeapEntry[] = [];

    while (this.heap.length > 0 && this.heap[0].expiresAt <= now) {
      const entry = this.pop();
      if (entry) {
        expired.push(entry);
      }
    }

    return expired;
  }

  /**
   * Clear all entries from the heap
   */
  clear(): void {
    this.heap.length = 0;
  }

  /**
   * Get all entries (for debugging/testing)
   */
  toArray(): HeapEntry[] {
    return [...this.heap];
  }

  private heapifyUp(index: number): void {
    if (index === 0) return;

    const parentIndex = Math.floor((index - 1) / 2);

    if (this.heap[index].expiresAt < this.heap[parentIndex].expiresAt) {
      this.swap(index, parentIndex);
      this.heapifyUp(parentIndex);
    }
  }

  private heapifyDown(index: number): void {
    const leftChild = 2 * index + 1;
    const rightChild = 2 * index + 2;
    let smallest = index;

    if (
      leftChild < this.heap.length &&
      this.heap[leftChild].expiresAt < this.heap[smallest].expiresAt
    ) {
      smallest = leftChild;
    }

    if (
      rightChild < this.heap.length &&
      this.heap[rightChild].expiresAt < this.heap[smallest].expiresAt
    ) {
      smallest = rightChild;
    }

    if (smallest !== index) {
      this.swap(index, smallest);
      this.heapifyDown(smallest);
    }
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }
}
