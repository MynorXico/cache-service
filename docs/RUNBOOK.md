# Cache Service Operational Runbook

## Overview

This runbook provides operational guidance for running the cache service in production. It covers monitoring,
troubleshooting, maintenance procedures, and emergency response.

## Service Health Monitoring

### Health Check Endpoints

| Endpoint       | Purpose            | Expected Response                     |
|----------------|--------------------|---------------------------------------|
| `GET /healthz` | Liveness probe     | 200 OK - Service is running           |
| `GET /readyz`  | Readiness probe    | 200 OK - Service ready for traffic    |
| `GET /metrics` | Prometheus metrics | 200 OK - Metrics in Prometheus format |

### Key Metrics to Monitor

#### Performance Metrics

```promql
# Request latency (target: p95 < 25ms)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Request rate
sum(rate(http_request_duration_seconds_count[5m])) by (method, route)

# Error rate (target: < 1%)
sum(rate(http_request_duration_seconds_count{status_code!~"2.."}[5m])) / 
sum(rate(http_request_duration_seconds_count[5m]))
```

#### Cache Metrics

```promql
# Cache hit rate (target: > 80%)
sum(rate(cache_hits_total[5m])) / 
(sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))

# Memory usage (target: < 90% of budget)
sum(cache_memory_bytes) / on() (memory_budget_bytes)

# Shard imbalance (target: < 0.2)
cache_shard_imbalance
```

#### System Metrics

```promql
# Active requests (target: < 80% of max_inflight)
http_active_requests / on() (max_inflight_requests)

# Backpressure events (target: 0)
rate(cache_backpressure_total[5m])

# Authentication failures (investigate if > 0)
rate(cache_auth_failures_total[5m])
```

## Alerting Rules

### Critical Alerts

```yaml
# High error rate
- alert: CacheServiceHighErrorRate
  expr: sum(rate(http_request_duration_seconds_count{status_code!~"2.."}[5m])) / sum(rate(http_request_duration_seconds_count[5m])) > 0.05
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Cache service error rate is {{ $value | humanizePercentage }}"

# Service down
- alert: CacheServiceDown
  expr: up{job="cache-service"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Cache service instance {{ $labels.instance }} is down"

# High latency
- alert: CacheServiceHighLatency
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.01
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Cache service p95 latency is {{ $value }}s"
```

### Warning Alerts

```yaml
# Memory usage high
- alert: CacheServiceHighMemoryUsage
  expr: sum(cache_memory_bytes) / on() (memory_budget_bytes) > 0.8
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Cache service memory usage is {{ $value | humanizePercentage }}"

# Shard imbalance
- alert: CacheServiceShardImbalance
  expr: cache_shard_imbalance > 0.3
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Cache service shard imbalance is {{ $value }}"

# Backpressure events
- alert: CacheServiceBackpressure
  expr: rate(cache_backpressure_total[5m]) > 0
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Cache service experiencing backpressure: {{ $value }} events/sec"
```

## Troubleshooting Guide

### High Latency Issues

#### Symptoms

- P95 latency > 25ms
- Slow response times reported by clients
- High CPU usage

#### Diagnosis Steps

1. **Check shard imbalance**:
   ```bash
   curl -s http://localhost:8080/metrics | grep cache_shard_imbalance
   ```

2. **Examine per-shard metrics**:
   ```promql
   cache_entries_total by (shard)
   cache_memory_bytes by (shard)
   ```

3. **Check system resources**:
   ```bash
   top -p $(pgrep node)
   iostat -x 1
   ```

#### Resolution Actions

1. **Increase shard count** (requires restart):
   ```bash
   export SHARDS=$(($(nproc) * 2))
   ```

2. **Reduce logging verbosity**:
   ```bash
   export LOG_LEVEL=error
   ```

3. **Tune memory budget**:
   ```bash
   export MEMORY_BUDGET_BYTES=2147483648  # 2GB
   ```

### Memory Issues

#### Symptoms

- High memory usage alerts
- Frequent evictions
- OOM kills in container environments

#### Diagnosis Steps

1. **Check memory metrics**:
   ```promql
   sum(cache_memory_bytes)
   rate(cache_evictions_total[5m])
   ```

2. **Examine large items**:
   ```promql
   cache_payload_bytes_total by (type)
   ```

3. **Check system memory**:
   ```bash
   free -h
   cat /proc/meminfo
   ```

#### Resolution Actions

1. **Set memory budget** (enables eviction):
   ```bash
   export MEMORY_BUDGET_BYTES=1073741824  # 1GB
   ```

2. **Reduce max item size**:
   ```bash
   export MAX_ITEM_BYTES=134217728  # 128MB
   ```

3. **Scale horizontally** (add more instances)

### Backpressure Issues

#### Symptoms

- 503 Service Unavailable responses
- High queue depths
- Client timeout errors

#### Diagnosis Steps

1. **Check backpressure metrics**:
   ```promql
   rate(cache_backpressure_total[5m])
   http_active_requests
   cache_queue_depth by (shard)
   ```

2. **Examine request patterns**:
   ```promql
   sum(rate(http_request_duration_seconds_count[5m])) by (method, route)
   ```

#### Resolution Actions

1. **Increase concurrency limits**:
   ```bash
   export MAX_INFLIGHT=2000
   export MAX_SHARD_MAILBOX=2000
   ```

2. **Increase request timeout**:
   ```bash
   export REQUEST_TIMEOUT_MS=5000
   ```

3. **Scale horizontally** or **implement client-side backoff**

### Authentication Issues

#### Symptoms

- 401 Unauthorized responses
- Authentication failure alerts
- Client access denied

#### Diagnosis Steps

1. **Check auth metrics**:
   ```promql
   rate(cache_auth_failures_total[5m]) by (reason)
   ```

2. **Verify token configuration**:
   ```bash
   echo $API_TOKEN | wc -c  # Should be > 32 characters
   ```

3. **Check client requests**:
   ```bash
   # Look for missing or invalid tokens in logs
   grep "auth" /var/log/cache-service.log
   ```

#### Resolution Actions

1. **Verify token matches**:
   ```bash
   # Client should send exactly this value
   echo "X-API-Token: $API_TOKEN"
   ```

2. **Check read auth requirements**:
   ```bash
   echo $READ_REQUIRES_AUTH  # Should be true/false
   ```

3. **Rotate token if compromised**:
   ```bash
   export API_TOKEN=$(openssl rand -hex 32)
   # Restart service and update clients
   ```

## Maintenance Procedures

### Routine Maintenance

#### Daily Tasks

1. **Check service health**:
   ```bash
   curl -f http://localhost:8080/healthz
   curl -f http://localhost:8080/readyz
   ```

2. **Review key metrics**:

- Error rate < 1%
- P95 latency < 25ms
- Memory usage < 90%
- No backpressure events

3. **Check log errors**:
   ```bash
   grep -i error /var/log/cache-service.log | tail -10
   ```

#### Weekly Tasks

1. **Performance review**:

- Analyze latency trends
- Review cache hit rates
- Check shard balance

2. **Capacity planning**:

- Monitor memory growth
- Review request volume trends
- Plan for peak traffic

3. **Security review**:

- Check authentication metrics
- Review access patterns
- Rotate tokens if needed

### Deployment Procedures

#### Rolling Update

1. **Pre-deployment checks**:
   ```bash
   # Verify current health
   curl -f http://localhost:8080/healthz
   
   # Check current metrics
   curl -s http://localhost:8080/metrics | grep -E "(cache_hits|http_request)"
   ```

2. **Deploy new version**:
   ```bash
   # Build new image
   docker build -t cache-service:v1.1.0 .
   
   # Update with zero downtime
   docker-compose up -d --no-deps cache-service
   ```

3. **Post-deployment verification**:
   ```bash
   # Wait for readiness
   timeout 30 bash -c 'until curl -f http://localhost:8080/readyz; do sleep 1; done'
   
   # Run smoke test
   npm run load-smoke
   
   # Monitor for 10 minutes
   watch -n 10 'curl -s http://localhost:8080/metrics | grep http_request_duration_seconds'
   ```

#### Configuration Changes

1. **Non-disruptive changes** (no restart required):

- Log level adjustments
- Metric collection intervals

2. **Disruptive changes** (restart required):

- Shard count changes
- Memory budget changes
- Authentication settings

3. **Change procedure**:
   ```bash
   # Update environment variables
   export NEW_SETTING=value
   
   # Graceful restart
   kill -TERM $(pgrep node)
   # Wait for graceful shutdown (up to 5 seconds)
   npm start
   ```

### Backup and Recovery

#### Data Backup

The cache service is stateless - no backup required. However, consider:

1. **Configuration backup**:
   ```bash
   # Save current environment
   env | grep -E "(API_TOKEN|SHARDS|MEMORY_)" > cache-config.env
   ```

2. **Metrics backup**:

- Prometheus data retention
- Grafana dashboard exports

#### Disaster Recovery

1. **Service failure**:
   ```bash
   # Check container status
   docker ps -a
   
   # Restart if needed
   docker-compose restart cache-service
   
   # Check logs for errors
   docker-compose logs cache-service
   ```

2. **Data corruption** (not applicable - stateless service)

3. **Complete rebuild**:
   ```bash
   # Pull latest code
   git pull origin main
   
   # Rebuild and restart
   docker-compose down
   docker-compose build
   docker-compose up -d
   ```

## Performance Tuning

### CPU Optimization

1. **Shard tuning**:
   ```bash
   # Start with 1-2x CPU cores
   export SHARDS=$(($(nproc) * 2))
   ```

2. **Process affinity** (Linux):
   ```bash
   # Pin to specific CPUs
   taskset -c 0-7 npm start
   ```

### Memory Optimization

1. **Heap tuning**:
   ```bash
   # Increase Node.js heap size
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

2. **Memory budget**:
   ```bash
   # Set to 70-80% of available RAM
   export MEMORY_BUDGET_BYTES=3221225472  # 3GB
   ```

### Network Optimization

1. **Connection limits**:
   ```bash
   # Increase file descriptor limits
   ulimit -n 65536
   ```

2. **TCP tuning** (Linux):
   ```bash
   # Optimize for high concurrency
   echo 'net.core.somaxconn = 65536' >> /etc/sysctl.conf
   echo 'net.ipv4.tcp_max_syn_backlog = 65536' >> /etc/sysctl.conf
   sysctl -p
   ```

## Emergency Procedures

### Service Outage

1. **Immediate response**:
   ```bash
   # Check service status
   systemctl status cache-service
   # or
   docker ps | grep cache-service
   
   # Restart if needed
   systemctl restart cache-service
   # or
   docker-compose restart cache-service
   ```

2. **If restart fails**:
   ```bash
   # Check logs for errors
   journalctl -u cache-service -n 50
   # or
   docker-compose logs --tail=50 cache-service
   
   # Check system resources
   df -h
   free -h
   ```

3. **Escalation**:

- Contact on-call engineer
- Check dependent services
- Consider failover to backup instance

### Memory Exhaustion

1. **Immediate mitigation**:
   ```bash
   # Enable memory budget (forces eviction)
   export MEMORY_BUDGET_BYTES=1073741824
   kill -HUP $(pgrep node)  # Reload config
   ```

2. **Monitor recovery**:
   ```bash
   # Watch memory usage
   watch -n 5 'curl -s http://localhost:8080/metrics | grep cache_memory_bytes'
   ```

### Security Incident

1. **Token compromise**:
   ```bash
   # Generate new token
   NEW_TOKEN=$(openssl rand -hex 32)
   export API_TOKEN=$NEW_TOKEN
   
   # Restart service
   systemctl restart cache-service
   
   # Update all clients with new token
   ```

2. **Unauthorized access**:
   ```bash
   # Enable read authentication
   export READ_REQUIRES_AUTH=true
   systemctl restart cache-service
   
   # Review access logs
   grep "401\|403" /var/log/cache-service.log
   ```

## Contact Information

- **Documentation**: https://github.com/MynorXico/cache-service

## References

- [Service Architecture](../ADRs/0001-sharded-actor-architecture.md)
- [Performance Tuning](../ADRs/0002-size-aware-lru-and-ttl-heap.md)
