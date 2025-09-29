# ADR-0002: Size-Aware LRU and TTL Heap

## Status

Accepted

## Context

The cache service needs efficient eviction policies to manage memory usage and handle key expiration. We must support:

1. **Memory-based eviction** when total cache size exceeds limits
2. **TTL-based expiration** for keys with time-to-live values
3. **High performance** with O(1) operations for hot paths
4. **Accurate accounting** of memory usage per entry

## Decision

We will implement two complementary data structures:

1. **Size-Aware LRU**: Doubly-linked list + hashmap with byte-level accounting
2. **TTL Min-Heap**: Binary heap for efficient expiration processing

## Rationale

### Size-Aware LRU Design

Traditional LRU caches track only entry count, but modern applications need memory-aware eviction:

- **Memory Pressure**: Large objects can consume disproportionate memory
- **Fair Eviction**: Size-based eviction is more predictable than count-based
- **Resource Control**: Prevents single large items from dominating cache

### Min-Heap for TTL

TTL expiration requires efficient access to earliest-expiring entries:

- **O(log N) insertion/deletion**: Efficient for dynamic workloads
- **O(1) peek**: Fast access to next expiration
- **Batch processing**: Can efficiently process multiple expired entries

## Implementation Details

### Size-Aware LRU Structure

```typescript
interface LRUNode<T> {
  key: string;
  value: T;
  sizeBytes: number;  // Memory footprint
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

class SizeAwareLRU<T> {
  private capacity: number;        // Max entry count
  private maxSizeBytes: number;    // Max memory usage
  private currentSizeBytes: number; // Current memory usage
  private cache: Map<string, LRUNode<T>>;
  // ... doubly-linked list management
}
```

### TTL Heap Structure

```typescript
interface HeapEntry {
  key: string;
  expiresAt: number;  // Epoch milliseconds
  shard: number;      // For distributed processing
}

class MinHeap {
  private heap: HeapEntry[];

  push(entry: HeapEntry): void;           // O(log N)
  pop(): HeapEntry | undefined;           // O(log N)
  peek(): HeapEntry | undefined;          // O(1)
  popExpired(now: number): HeapEntry[];   // O(k log N)
}
```

### Memory Calculation

Accurate size calculation for different value types:

```typescript
function calculateValueSize(value: unknown, type: ValueType): number {
  switch (type) {
    case 'string':
      return Buffer.byteLength(value as string, 'utf8');
    case 'number':
      return 8; // 64-bit float
    case 'boolean':
      return 1;
    case 'json':
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    case 'bytes':
      return (value as Buffer).length;
  }
}
```

### Eviction Algorithm

When memory limit is exceeded:

1. **Calculate overage**: `currentSize - maxSize`
2. **Evict from tail**: Remove LRU entries until under limit
3. **Update metrics**: Track evicted entries and bytes freed
4. **Return evicted**: Allow caller to handle cleanup

### Expiration Processing

Background timer processes TTL heap:

1. **Periodic sweep**: Check heap every second
2. **Batch processing**: Remove all expired entries in one pass
3. **Lazy expiration**: Check TTL on read operations
4. **Metrics tracking**: Count expired entries per shard

## Performance Characteristics

### LRU Operations

- **Get**: O(1) - HashMap lookup + list manipulation
- **Set**: O(1) - HashMap insert + list manipulation
- **Eviction**: O(k) where k = entries to evict
- **Memory**: O(N) for N entries

### TTL Heap Operations

- **Insert**: O(log N) - Binary heap insertion
- **Expire**: O(k log N) where k = expired entries
- **Peek**: O(1) - Access heap root
- **Memory**: O(N) for N entries with TTL

### Combined Performance

- **Cache Hit**: O(1) - LRU get + TTL check
- **Cache Set**: O(log N) - LRU set + heap insert (if TTL)
- **Background Expiry**: O(k log N) - Process k expired entries
- **Memory Eviction**: O(m) - Evict m LRU entries

## Consequences

### Positive

- **Memory Control**: Precise memory usage tracking and limits
- **Performance**: O(1) hot path operations for cache hits
- **Fairness**: Size-based eviction prevents large item dominance
- **Efficiency**: Batch TTL processing reduces overhead
- **Observability**: Rich metrics for memory and expiration

### Negative

- **Complexity**: Two data structures to maintain consistency
- **Memory Overhead**: Additional metadata per entry
- **GC Pressure**: Frequent allocations for heap operations
- **Accuracy Trade-offs**: JSON serialization for size calculation

### Mitigations

- **Consistency**: Careful synchronization between LRU and heap
- **Memory Pools**: Reuse node objects to reduce allocations
- **Approximation**: Cache serialized sizes for repeated values
- **Monitoring**: Metrics to detect performance issues

## Alternatives Considered

### Count-Based LRU Only

**Pros**: Simpler implementation, lower overhead
**Cons**: No memory control, unpredictable eviction behavior

### Time-Based Expiration Only

**Pros**: Simpler than heap, predictable cleanup
**Cons**: No memory pressure handling, potential OOM

### Combined LRU-TTL Structure

**Pros**: Single data structure, potentially more efficient
**Cons**: Complex implementation, harder to optimize separately

### External Expiration Service

**Pros**: Offloads complexity, potentially more scalable
**Cons**: Network overhead, additional dependencies

### Probabilistic Eviction (Redis-style)

**Pros**: O(1) eviction, good performance
**Cons**: Less predictable, harder to reason about

## Configuration Options

### Memory Budget

```typescript
// Per-shard memory limit
const perShardMemory = totalMemoryBudget / shardCount;
const lru = new SizeAwareLRU(Infinity, perShardMemory);
```

### TTL Precision

```typescript
// Background expiration interval
const EXPIRATION_INTERVAL_MS = 1000; // 1 second
```

### Eviction Batch Size

```typescript
// Maximum entries to evict in single operation
const MAX_EVICTION_BATCH = 100;
```

## Future Enhancements

### Advanced Eviction Policies

1. **LFU (Least Frequently Used)**: Track access frequency
2. **Adaptive Replacement**: Combine LRU and LFU
3. **Size-Weighted LFU**: Frequency adjusted by entry size
4. **Time-Aware**: Consider both recency and frequency

### Memory Optimizations

1. **Compressed Storage**: Compress large values automatically
2. **Tiered Storage**: Move cold data to slower storage
3. **Memory Mapping**: Use OS virtual memory for large caches
4. **Custom Allocators**: Reduce GC pressure with manual memory management

### TTL Improvements

1. **Hierarchical Timers**: Multiple heaps for different time scales
2. **Lazy Deletion**: Mark expired but don't immediately remove
3. **TTL Refresh**: Extend TTL on access (sliding window)
4. **Batch TTL Updates**: Efficiently update multiple entries

### Monitoring Enhancements

1. **Size Distribution**: Histogram of entry sizes
2. **Eviction Patterns**: Track which entries get evicted
3. **TTL Effectiveness**: Measure natural vs forced expiration
4. **Memory Fragmentation**: Track internal vs external fragmentation

## Testing Strategy

### Unit Tests

- **LRU Correctness**: Verify eviction order and size tracking
- **Heap Properties**: Ensure min-heap invariants maintained
- **Edge Cases**: Empty cache, single entry, capacity limits
- **Performance**: Benchmark operations under load

### Integration Tests

- **Consistency**: Verify LRU and heap stay synchronized
- **Concurrency**: Test under concurrent access patterns
- **Memory Limits**: Verify accurate memory enforcement
- **TTL Accuracy**: Test expiration timing and cleanup

### Property-Based Tests

- **Invariants**: Cache size never exceeds limits
- **Ordering**: LRU order maintained across operations
- **Expiration**: All expired entries eventually removed
- **Memory**: Calculated sizes match actual usage
