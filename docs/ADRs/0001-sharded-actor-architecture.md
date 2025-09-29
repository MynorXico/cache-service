# ADR-0001: Sharded Actor Architecture

## Status

Accepted

## Context

We need to design a high-performance, concurrent caching service that can handle thousands of requests per second while
maintaining data consistency and avoiding lock contention. The service must be scalable within a single process and
provide clear interfaces for future multi-node clustering.

## Decision

We will implement a sharded architecture where:

1. **Sharding Strategy**: Use jump consistent hashing to distribute keys across N shards
2. **Actor Model**: Each shard operates as an independent actor with its own mailbox
3. **Concurrency Control**: Serialize mutations per shard while allowing concurrent reads
4. **Lock-Free Reads**: Implement fast-path reads without queuing or locking

## Rationale

### Sharding Benefits

- **Horizontal Scalability**: Performance scales linearly with CPU cores
- **Reduced Contention**: Each shard operates independently
- **Cache Locality**: Related operations often hit the same shard
- **Future-Proof**: Easy to extend to multi-node clustering

### Jump Consistent Hashing

- **Minimal Remapping**: Only K/N keys need remapping when shard count changes
- **Deterministic**: Same key always maps to same shard
- **Load Balancing**: Provides good distribution across shards

### Actor Model per Shard

- **Serialization**: Mutations are processed sequentially per shard
- **No Locks**: Eliminates deadlocks and reduces complexity
- **Backpressure**: Natural flow control via mailbox limits
- **Isolation**: Shard failures don't affect other shards

### Lock-Free Reads

- **Performance**: Reads don't block on writes or other reads
- **Scalability**: Read throughput scales with CPU cores
- **Consistency**: Atomic metadata checks ensure data integrity

## Implementation Details

### Shard Distribution

```typescript
function getShardForKey(key: string, numShards: number): number {
  return jumpConsistentHash(key, numShards);
}
```

### Actor Mailbox

Each shard maintains an operation queue:

```typescript
interface ShardOperation {
  type: 'set' | 'delete' | 'expire' | 'evict';
  key: string;
  entry?: CacheEntry;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}
```

### Concurrency Model

- **Writes**: Queued and processed sequentially per shard
- **Reads**: Direct access with lazy expiration checks
- **Backpressure**: 503 responses when mailboxes are full

## Consequences

### Positive

- **High Performance**: Sub-25ms p95 latency achievable
- **Scalability**: Linear performance scaling with cores
- **Consistency**: Strong per-key consistency guarantees
- **Maintainability**: Clear separation of concerns
- **Extensibility**: Easy to add new operations or shard types

### Negative

- **Memory Overhead**: Each shard has its own data structures
- **Complexity**: More complex than single-threaded approach
- **Debugging**: Distributed state can be harder to debug
- **Imbalance Risk**: Poor key distribution can cause hotspots

### Mitigations

- **Monitoring**: Shard imbalance metrics to detect hotspots
- **Tuning**: Configurable shard count for different workloads
- **Observability**: Per-shard metrics and logging
- **Testing**: Comprehensive tests for concurrent scenarios

## Alternatives Considered

### Single-Threaded with Event Loop

**Pros**: Simple, no concurrency issues
**Cons**: Limited by single CPU core, poor scalability

### Shared State with Locks

**Pros**: Familiar pattern, easier to reason about
**Cons**: Lock contention, deadlock risk, poor performance

### Worker Threads

**Pros**: True parallelism, process isolation
**Cons**: Serialization overhead, complex IPC, memory duplication

### External Database

**Pros**: Proven scalability, persistence
**Cons**: Network latency, external dependency, complexity

## Future Considerations

### Multi-Node Clustering

The sharded architecture provides a clear path to clustering:

1. **Consistent Hashing**: Extend to hash ring for node distribution
2. **Replication**: Add replica shards for fault tolerance
3. **Coordination**: Use consensus algorithms for cluster membership
4. **Migration**: Implement shard migration for rebalancing

### Performance Optimizations

1. **NUMA Awareness**: Pin shards to specific CPU cores
2. **Memory Pools**: Pre-allocate memory to reduce GC pressure
3. **Batch Processing**: Group operations for better cache locality
4. **Compression**: Compress large values to reduce memory usage

### Operational Features

1. **Hot Shards**: Automatic detection and mitigation
2. **Graceful Scaling**: Online shard count changes
3. **Maintenance Mode**: Controlled shutdown and restart
4. **Health Checks**: Per-shard health monitoring
