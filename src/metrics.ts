/**
 * Prometheus metrics for cache service observability
 */

import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from 'prom-client';

// Enable default Node.js metrics
collectDefaultMetrics({ register });

// Cache operation counters
export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['shard'],
});

export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['shard'],
});

export const cacheSetsTotal = new Counter({
  name: 'cache_sets_total',
  help: 'Total number of cache sets',
  labelNames: ['shard'],
});

export const cacheDeletesTotal = new Counter({
  name: 'cache_deletes_total',
  help: 'Total number of cache deletes',
  labelNames: ['shard'],
});

export const cacheEvictionsTotal = new Counter({
  name: 'cache_evictions_total',
  help: 'Total number of cache evictions',
  labelNames: ['shard'],
});

export const cacheExpirationsTotal = new Counter({
  name: 'cache_expirations_total',
  help: 'Total number of cache expirations',
  labelNames: ['shard'],
});

// CAS operation counters
export const casConflictsTotal = new Counter({
  name: 'cache_cas_conflicts_total',
  help: 'Total number of CAS conflicts',
  labelNames: ['operation'],
});

// Memory and storage metrics
export const cacheMemoryBytes = new Gauge({
  name: 'cache_memory_bytes',
  help: 'Current cache memory usage in bytes',
  labelNames: ['shard'],
});

export const cacheEntriesTotal = new Gauge({
  name: 'cache_entries_total',
  help: 'Current number of cache entries',
  labelNames: ['shard'],
});

export const payloadBytesTotal = new Counter({
  name: 'cache_payload_bytes_total',
  help: 'Total bytes of payload data processed',
  labelNames: ['operation', 'type'],
});

// Request metrics
export const requestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const activeRequestsGauge = new Gauge({
  name: 'http_active_requests',
  help: 'Number of active HTTP requests',
});

export const queueDepthGauge = new Gauge({
  name: 'cache_queue_depth',
  help: 'Current depth of shard operation queues',
  labelNames: ['shard'],
});

// Shard balance metrics
export const shardImbalanceGauge = new Gauge({
  name: 'cache_shard_imbalance',
  help: 'Coefficient of variation of entries across shards (0 = perfectly balanced)',
});

// Backpressure metrics
export const backpressureTotal = new Counter({
  name: 'cache_backpressure_total',
  help: 'Total number of requests rejected due to backpressure',
  labelNames: ['reason'],
});

// Auth metrics
export const authFailuresTotal = new Counter({
  name: 'cache_auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['reason'],
});

/**
 * Update cache metrics from shard statistics
 */
export function updateCacheMetrics(shardStats: any[]) {
  shardStats.forEach((stats, shardId) => {
    cacheHitsTotal.labels(shardId.toString()).inc(0); // Ensure metric exists
    cacheMissesTotal.labels(shardId.toString()).inc(0);
    cacheSetsTotal.labels(shardId.toString()).inc(0);
    cacheDeletesTotal.labels(shardId.toString()).inc(0);
    cacheEvictionsTotal.labels(shardId.toString()).inc(0);
    cacheExpirationsTotal.labels(shardId.toString()).inc(0);

    cacheMemoryBytes.labels(shardId.toString()).set(stats.memoryBytes);
    cacheEntriesTotal.labels(shardId.toString()).set(stats.entries);
  });
}

/**
 * Record a cache operation
 */
export function recordCacheOperation(
  operation: 'hit' | 'miss' | 'set' | 'delete' | 'eviction' | 'expiration',
  shard: number,
  count: number = 1
) {
  const shardLabel = shard.toString();

  switch (operation) {
    case 'hit':
      cacheHitsTotal.labels(shardLabel).inc(count);
      break;
    case 'miss':
      cacheMissesTotal.labels(shardLabel).inc(count);
      break;
    case 'set':
      cacheSetsTotal.labels(shardLabel).inc(count);
      break;
    case 'delete':
      cacheDeletesTotal.labels(shardLabel).inc(count);
      break;
    case 'eviction':
      cacheEvictionsTotal.labels(shardLabel).inc(count);
      break;
    case 'expiration':
      cacheExpirationsTotal.labels(shardLabel).inc(count);
      break;
  }
}

/**
 * Record payload size
 */
export function recordPayloadSize(operation: string, type: string, bytes: number) {
  payloadBytesTotal.labels(operation, type).inc(bytes);
}

/**
 * Record CAS conflict
 */
export function recordCasConflict(operation: string) {
  casConflictsTotal.labels(operation).inc();
}

/**
 * Record backpressure event
 */
export function recordBackpressure(reason: string) {
  backpressureTotal.labels(reason).inc();
}

/**
 * Record authentication failure
 */
export function recordAuthFailure(reason: string) {
  authFailuresTotal.labels(reason).inc();
}

/**
 * Update shard imbalance metric
 */
export function updateShardImbalance(imbalance: number) {
  shardImbalanceGauge.set(imbalance);
}

/**
 * Get metrics registry for /metrics endpoint
 */
export function getMetricsRegistry() {
  return register;
}
