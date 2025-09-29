/**
 * Comprehensive stress testing tool for cache service
 * Provides detailed performance analysis and load testing
 */

import http from 'http';
import { performance } from 'perf_hooks';

interface StressConfig {
  baseUrl: string;
  apiToken: string;
  warmupKeys: number;
  duration: number;
  concurrency: number;
  readRatio: number; // 0.0 to 1.0
}

interface RequestResult {
  success: boolean;
  latency: number;
  operation: string;
  statusCode?: number;
  error?: string;
}

class CacheStressTester {
  private config: StressConfig;
  private results: RequestResult[] = [];
  private running = false;

  constructor(config: StressConfig) {
    this.config = config;
  }

  async run(): Promise<void> {
    console.log('🚀 Starting Cache Service Stress Test');
    console.log(`Configuration:
  - Base URL: ${this.config.baseUrl}
  - Warmup Keys: ${this.config.warmupKeys}
  - Duration: ${this.config.duration}s
  - Concurrency: ${this.config.concurrency}
  - Read Ratio: ${(this.config.readRatio * 100).toFixed(1)}%`);

    try {
      // Phase 1: Warmup
      await this.warmup();

      // Phase 2: Stress test
      await this.stressTest();

      // Phase 3: Report results
      this.generateReport();
    } catch (error) {
      console.error('❌ Stress test failed:', error);
      process.exit(1);
    }
  }

  private async warmup(): Promise<void> {
    console.log('\n📈 Phase 1: Warming up cache...');

    const batchSize = 100;
    const batches = Math.ceil(this.config.warmupKeys / batchSize);

    for (let batch = 0; batch < batches; batch++) {
      const items = [];
      const start = batch * batchSize;
      const end = Math.min(start + batchSize, this.config.warmupKeys);

      for (let i = start; i < end; i++) {
        items.push({
          key: `warmup-key-${i}`,
          value: `warmup-value-${i}-${Math.random().toString(36)}`,
          type: 'string',
          ttlSec: 3600, // 1 hour
        });
      }

      await this.batchSet(items);

      if (batch % 10 === 0) {
        console.log(`  Warmed up ${end}/${this.config.warmupKeys} keys...`);
      }
    }

    console.log(`✅ Warmup complete: ${this.config.warmupKeys} keys loaded`);
  }

  private async stressTest(): Promise<void> {
    console.log('\n🔥 Phase 2: Running stress test...');

    this.running = true;
    this.results = [];

    // Start concurrent workers
    const workers = [];
    for (let i = 0; i < this.config.concurrency; i++) {
      workers.push(this.worker(i));
    }

    // Stop after duration
    setTimeout(() => {
      this.running = false;
    }, this.config.duration * 1000);

    // Wait for all workers to complete
    await Promise.all(workers);

    console.log(`✅ Stress test complete: ${this.results.length} operations executed`);
  }

  private async worker(workerId: number): Promise<void> {
    while (this.running) {
      try {
        const operation = Math.random() < this.config.readRatio ? 'read' : 'write';
        const key = `warmup-key-${Math.floor(Math.random() * this.config.warmupKeys)}`;

        let result: RequestResult;

        if (operation === 'read') {
          result = await this.performGet(key);
        } else {
          result = await this.performSet(key, `updated-${Date.now()}-${workerId}`);
        }

        this.results.push(result);

        // Small delay to prevent overwhelming
        await this.sleep(1);
      } catch (error) {
        this.results.push({
          success: false,
          latency: 0,
          operation: 'unknown',
          error: error.message,
        });
      }
    }
  }

  private async performGet(key: string): Promise<RequestResult> {
    const start = performance.now();

    try {
      const response = await this.httpRequest('GET', `/v1/kv/${key}`);
      const latency = performance.now() - start;

      return {
        success: response.statusCode === 200 || response.statusCode === 404,
        latency,
        operation: 'get',
        statusCode: response.statusCode,
      };
    } catch (error) {
      return {
        success: false,
        latency: performance.now() - start,
        operation: 'get',
        error: error.message,
      };
    }
  }

  private async performSet(key: string, value: string): Promise<RequestResult> {
    const start = performance.now();

    try {
      const body = JSON.stringify({
        value,
        type: 'string',
        ttlSec: 3600,
      });

      const response = await this.httpRequest('PUT', `/v1/kv/${key}`, body);
      const latency = performance.now() - start;

      return {
        success: response.statusCode === 200 || response.statusCode === 201,
        latency,
        operation: 'set',
        statusCode: response.statusCode,
      };
    } catch (error) {
      return {
        success: false,
        latency: performance.now() - start,
        operation: 'set',
        error: error.message,
      };
    }
  }

  private async batchSet(items: any[]): Promise<void> {
    const body = JSON.stringify({ items });
    await this.httpRequest('POST', '/v1/kv/batch/set', body);
  }

  private async httpRequest(method: string, path: string, body?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.config.baseUrl);

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': this.config.apiToken,
        },
      };

      if (body) {
        options.headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  private generateReport(): void {
    console.log('\n📊 Performance Report');
    console.log('='.repeat(50));

    const successful = this.results.filter((r) => r.success);
    const failed = this.results.filter((r) => !r.success);

    const getOps = successful.filter((r) => r.operation === 'get');
    const setOps = successful.filter((r) => r.operation === 'set');

    // Overall statistics
    console.log(`Total Operations: ${this.results.length}`);
    console.log(
      `Successful: ${successful.length} (${((successful.length / this.results.length) * 100).toFixed(2)}%)`
    );
    console.log(
      `Failed: ${failed.length} (${((failed.length / this.results.length) * 100).toFixed(2)}%)`
    );
    console.log(`QPS: ${(this.results.length / this.config.duration).toFixed(2)}`);

    // Latency statistics
    if (successful.length > 0) {
      const latencies = successful.map((r) => r.latency).sort((a, b) => a - b);

      console.log('\nLatency Statistics (ms):');
      console.log(`  Average: ${this.average(latencies).toFixed(2)}`);
      console.log(`  Median: ${this.percentile(latencies, 50).toFixed(2)}`);
      console.log(`  P95: ${this.percentile(latencies, 95).toFixed(2)}`);
      console.log(`  P99: ${this.percentile(latencies, 99).toFixed(2)}`);
      console.log(`  Min: ${Math.min(...latencies).toFixed(2)}`);
      console.log(`  Max: ${Math.max(...latencies).toFixed(2)}`);
    }

    // Operation breakdown
    if (getOps.length > 0) {
      const getLatencies = getOps.map((r) => r.latency);
      console.log(`\nGET Operations (${getOps.length}):`);
      console.log(`  Average latency: ${this.average(getLatencies).toFixed(2)}ms`);
      console.log(`  P95 latency: ${this.percentile(getLatencies, 95).toFixed(2)}ms`);
    }

    if (setOps.length > 0) {
      const setLatencies = setOps.map((r) => r.latency);
      console.log(`\nSET Operations (${setOps.length}):`);
      console.log(`  Average latency: ${this.average(setLatencies).toFixed(2)}ms`);
      console.log(`  P95 latency: ${this.percentile(setLatencies, 95).toFixed(2)}ms`);
    }

    // Error analysis
    if (failed.length > 0) {
      console.log('\nError Analysis:');
      const errorCounts = new Map<string, number>();

      failed.forEach((r) => {
        const key = r.error || `HTTP ${r.statusCode}`;
        errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
      });

      for (const [error, count] of errorCounts) {
        console.log(`  ${error}: ${count}`);
      }
    }

    // Performance validation
    const p95 =
      successful.length > 0
        ? this.percentile(
            successful.map((r) => r.latency),
            95
          )
        : Infinity;

    console.log('\n🎯 Performance Validation:');
    console.log(`P95 latency: ${p95.toFixed(2)}ms (target: <25ms)`);

    if (p95 < 5) {
      console.log('✅ Performance target met!');
    } else if (p95 < 20) {
      console.log('⚠️  Performance acceptable but above target');
    } else {
      console.log('❌ Performance below expectations');
    }
  }

  private average(numbers: number[]): number {
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  private percentile(numbers: number[], p: number): number {
    const index = Math.ceil((p / 100) * numbers.length) - 1;
    return numbers[Math.max(0, index)];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// CLI interface
async function main() {
  const config: StressConfig = {
    baseUrl: process.env.BASE_URL || 'http://localhost:8080',
    apiToken: process.env.API_TOKEN || 'your-api-token-here',
    warmupKeys: parseInt(process.env.WARMUP_KEYS || '1000'),
    duration: parseInt(process.env.DURATION || '30'),
    concurrency: parseInt(process.env.CONCURRENCY || '50'),
    readRatio: parseFloat(process.env.READ_RATIO || '0.8'),
  };

  const tester = new CacheStressTester(config);
  await tester.run();
}

if (require.main === module) {
  main().catch(console.error);
}
