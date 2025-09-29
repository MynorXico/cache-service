# Cache Service

A production-grade, high-performance in-memory caching service built with TypeScript and Node.js. Features sharded
architecture, CAS operations, TTL support, and comprehensive observability.

## Features

- 🚀 **High Performance**: Sub-25ms p95 latency for GET operations
- 🔧 **Sharded Architecture**: Horizontal scaling with hashing
- 🔒 **CAS Operations**: Compare-and-swap for safe concurrent updates
- ⏰ **TTL Support**: Per-key expiration with efficient background cleanup
- 📊 **Rich Observability**: Prometheus metrics, structured logging, tracing hooks
- 🛡️ **Security**: Token-based authentication with configurable read access
- 🎯 **Type Safety**: Full TypeScript implementation with strict typing
- 🐳 **Production Ready**: Docker support, CI/CD, comprehensive testing

## Quick Start

### Local Development

```bash
# Clone and install dependencies
git clone <repository-url>
cd cache-service
npm install

# Set required environment variables
export API_TOKEN=your-secure-token-here

# Start in development mode
npm run dev

# Or build and start production
npm run build
npm start
```

### Docker

```bash
# Build and run with Docker
docker build -t cache-service .
docker run -p 8080:8080 -e API_TOKEN=your-token cache-service

# Or use docker-compose
docker-compose up
```

### Basic Usage

The API automatically infers value types from JavaScript/JSON types:

```bash
# String values
curl -X PUT http://localhost:8080/v1/kv/mystring \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"value": "hello world", "ttlSec": 3600}'

# Number values  
curl -X PUT http://localhost:8080/v1/kv/mynumber \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"value": 42}'

# Boolean values
curl -X PUT http://localhost:8080/v1/kv/mybool \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"value": true}'

# JSON objects and arrays
curl -X PUT http://localhost:8080/v1/kv/myobject \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "Alice", "age": 30}}'

# Get a key (returns value with inferred type)
curl http://localhost:8080/v1/kv/mystring

# Delete a key
curl -X DELETE http://localhost:8080/v1/kv/mystring \
  -H "X-API-Token: your-token"

# Batch operations
curl -X POST http://localhost:8080/v1/kv/batch/get \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"keys": ["key1", "key2", "key3"]}'

# Atomic increment
curl -X POST http://localhost:8080/v1/kv/incr \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"key": "counter", "delta": 5}'
```

## Configuration

All configuration is done via environment variables:

| Variable              | Default      | Description                                    |
|-----------------------|--------------|------------------------------------------------|
| `PORT`                | `8080`       | HTTP server port                               |
| `API_TOKEN`           | **Required** | Authentication token for write operations      |
| `READ_REQUIRES_AUTH`  | `false`      | Whether read operations require authentication |
| `SHARDS`              | CPU count    | Number of cache shards for concurrency         |
| `MAX_ITEM_BYTES`      | `268435456`  | Maximum size per cache item (256MB)            |
| `MEMORY_BUDGET_BYTES` | Unlimited    | Total memory limit for LRU eviction            |
| `REQUEST_TIMEOUT_MS`  | `2000`       | Request timeout in milliseconds                |
| `MAX_INFLIGHT`        | `1000`       | Maximum concurrent requests                    |
| `MAX_SHARD_MAILBOX`   | `1000`       | Maximum queued operations per shard            |
| `LOG_LEVEL`           | `info`       | Logging level (debug/info/warn/error)          |

### Example Production Configuration

```bash
export PORT=8080
export API_TOKEN=prod-secure-token-$(openssl rand -hex 32)
export READ_REQUIRES_AUTH=true
export SHARDS=8
export MEMORY_BUDGET_BYTES=4294967296  # 4GB
export REQUEST_TIMEOUT_MS=1000
export MAX_INFLIGHT=2000
export LOG_LEVEL=warn
```

## API Reference

### Data Types

The cache supports strongly-typed values:

- `string`: UTF-8 text
- `number`: 64-bit floating point
- `boolean`: true/false
- `json`: Objects and arrays
- `bytes`: Base64-encoded binary data

### Endpoints

#### Single Key Operations

- `PUT /v1/kv/{key}` - Set or update a key
- `GET /v1/kv/{key}` - Retrieve a key
- `DELETE /v1/kv/{key}` - Delete a key

#### Batch Operations

- `POST /v1/kv/batch/get` - Get multiple keys
- `POST /v1/kv/batch/set` - Set multiple keys
- `POST /v1/kv/batch/delete` - Delete multiple keys

#### Atomic Operations

- `POST /v1/kv/incr` - Atomic increment/decrement

#### Health & Monitoring

- `GET /healthz` - Liveness probe
- `GET /readyz` - Readiness probe
- `GET /metrics` - Prometheus metrics

#### Documentation

- `GET /docs` - Swagger UI (development only)

### CAS (Compare-and-Swap) Operations

Use conditional headers for safe concurrent updates:

```bash
# Create-only (fails if key exists)
curl -X PUT http://localhost:8080/v1/kv/mykey \
  -H "If-None-Match: *" \
  -H "X-API-Token: your-token" \
  -d '{"value": "new"}'

# Conditional update (fails if version changed)
curl -X PUT http://localhost:8080/v1/kv/mykey \
  -H "If-Match: version-string" \
  -H "X-API-Token: your-token" \
  -d '{"value": "updated"}'

# Conditional delete
curl -X DELETE http://localhost:8080/v1/kv/mykey \
  -H "If-Match: version-string" \
  -H "X-API-Token: your-token"
```

## Performance

### Benchmarks

On a modern 8-core machine with the default configuration:

- **GET operations**: ~50,000 QPS, p95 < 2ms
- **SET operations**: ~30,000 QPS, p95 < 25ms
- **Batch operations**: ~5,000 batch QPS (100 keys/batch)

### Performance Tuning

1. **Increase shards** for CPU-bound workloads:
   ```bash
   export SHARDS=16  # 2x CPU cores
   ```

2. **Tune memory budget** for memory-constrained environments:
   ```bash
   export MEMORY_BUDGET_BYTES=2147483648  # 2GB
   ```

3. **Adjust concurrency limits** for high-traffic scenarios:
   ```bash
   export MAX_INFLIGHT=5000
   export MAX_SHARD_MAILBOX=2000
   ```

4. **Reduce logging** in production:
   ```bash
   export LOG_LEVEL=error
   ```

### Load Testing

Run the included stress test:

```bash
# Basic stress test
npm run stress

# Custom configuration
BASE_URL=http://localhost:8080 \
API_TOKEN=your-token \
WARMUP_KEYS=10000 \
DURATION=60 \
CONCURRENCY=100 \
READ_RATIO=0.8 \
npm run stress
```

## Monitoring

### Prometheus Metrics

Key metrics exposed at `/metrics`:

- `cache_hits_total` / `cache_misses_total` - Cache hit/miss rates
- `cache_memory_bytes` - Memory usage per shard
- `cache_entries_total` - Number of entries per shard
- `http_request_duration_seconds` - Request latency histograms
- `cache_evictions_total` - LRU evictions
- `cache_expirations_total` - TTL expirations
- `cache_shard_imbalance` - Shard distribution balance

### Example Grafana Queries

```promql
# Cache hit rate
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))

# P95 request latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Memory usage
sum(cache_memory_bytes) by (instance)

# QPS by operation
sum(rate(http_request_duration_seconds_count[5m])) by (method, route)
```

### Structured Logging

All logs are JSON-formatted with correlation IDs:

```json
{
  "level": "info",
  "time": "2024-01-01T12:00:00.000Z",
  "reqId": "01HQXYZ123",
  "method": "GET",
  "path": "/v1/kv/mykey",
  "status": 200,
  "latencyMs": 1.23,
  "msg": "GET /v1/kv/mykey - 200"
}
```

## Security

### Authentication

- Write operations require `X-API-Token` header
- Read operations optionally require auth (configurable)
- Token should be cryptographically secure (32+ bytes)

### Best Practices

1. **Use strong tokens**:
   ```bash
   export API_TOKEN=$(openssl rand -hex 32)
   ```

2. **Enable read auth for sensitive data**:
   ```bash
   export READ_REQUIRES_AUTH=true
   ```

3. **Run as non-root user** (Docker does this automatically)

4. **Use TLS in production** (reverse proxy recommended)

## Development

### Project Structure

```
cache-service/
├── src/
│   ├── core/           # Core cache implementation
│   ├── middleware/     # Express middleware
│   ├── routes/         # API route handlers
│   ├── config.ts       # Configuration management
│   ├── server.ts       # Express server setup
│   └── index.ts        # Application entry point
├── test/               # Test suite
├── scripts/            # Utility scripts
├── docs/               # Documentation
└── openapi.yaml        # API specification
```

### Available Scripts

```bash
npm run dev          # Development server with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run test suite
npm run test:coverage # Run tests with coverage
npm run lint         # Lint code
npm run format       # Format code
npm run stress       # Run stress test
npm run load-smoke   # Run CI smoke test
```

### Testing

```bash
# Run all tests
npm test

# Run specific test files
npm test -- test/lru.test.ts

# Run with coverage
npm run test:coverage

# Run load tests
npm run load-smoke
npm run stress
```

## Architecture

### Sharded Design

The cache uses a sharded architecture for horizontal scalability:

- Keys are distributed across N shards using key hashing
- Each shard operates independently with its own LRU and TTL heap
- Operations are queued per-shard to avoid cross-shard locks
- Read operations use a fast path without queuing

### Actor Model

Each shard implements an actor pattern:

- Mutations are queued and processed sequentially
- Reads are lock-free and immediate
- Backpressure prevents queue overflow
- Graceful shutdown drains pending operations

### Memory Management

- Size-aware LRU eviction when memory budget is set
- Efficient TTL expiration using min-heap
- Per-shard memory accounting
- Configurable item size limits

## Deployment

### Docker Production

```dockerfile
# Multi-stage build for minimal image size
FROM node:22-alpine AS production

# Non-root user for security
USER cache

# Health checks included
HEALTHCHECK --interval=30s --timeout=3s CMD ...
```

## Troubleshooting

### Common Issues

1. **High latency**:

- Check shard imbalance metric
- Increase `SHARDS` if CPU-bound
- Reduce `LOG_LEVEL` if I/O-bound

2. **Memory usage**:

- Set `MEMORY_BUDGET_BYTES` for automatic eviction
- Monitor `cache_evictions_total` metric
- Check for large items via `cache_payload_bytes_total`

3. **503 Service Unavailable**:

- Increase `MAX_INFLIGHT` for higher concurrency
- Increase `MAX_SHARD_MAILBOX` for bursty workloads
- Check `cache_backpressure_total` metric

4. **Authentication failures**:

- Verify `X-API-Token` header is set correctly
- Check `cache_auth_failures_total` metric
- Ensure token matches `API_TOKEN` environment variable

### Debug Mode

Enable debug logging for troubleshooting:

```bash
export LOG_LEVEL=debug
npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the full test suite
5. Submit a pull request

### Code Style

- TypeScript with strict mode
- ESLint + Prettier for formatting
- 100% test coverage for core components
- Comprehensive JSDoc comments

## License

MIT License

## Related Documentation

- [ADR-0001: Sharded Actor Architecture](docs/ADRs/0001-sharded-actor-architecture.md)
- [ADR-0002: Size-Aware LRU and TTL Heap](docs/ADRs/0002-size-aware-lru-and-ttl-heap.md)
- [Operational Runbook](docs/RUNBOOK.md)
- [API Documentation](http://localhost:8080/docs) (when running)
