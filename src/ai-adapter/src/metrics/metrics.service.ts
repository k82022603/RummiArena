import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * LLM 호출 성능 메트릭 기록 구조.
 */
export interface LlmMetricRecord {
  modelType: string;
  modelName: string;
  gameId: string;
  /** 응답 시간 (ms) */
  latencyMs: number;
  /** 입력 토큰 수 */
  promptTokens: number;
  /** 출력 토큰 수 */
  completionTokens: number;
  /** JSON 파싱 성공 여부 */
  parseSuccess: boolean;
  /** 강제 드로우 여부 */
  isFallbackDraw: boolean;
  /** 재시도 횟수 */
  retryCount: number;
  /** 타임스탬프 (ISO 8601) */
  timestamp: string;
}

/**
 * 모델별 집계 메트릭 응답 구조.
 */
export interface ModelMetricsSummary {
  modelType: string;
  totalRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  parseSuccessRate: number;
  fallbackDrawRate: number;
  avgRetryCount: number;
}

/**
 * LLM 호출 성능 메트릭을 Redis에 기록하는 서비스.
 *
 * 데이터 구조:
 * - Redis Sorted Set: metrics:latency:{modelType}:{YYYY-MM-DD}
 *   score = latencyMs, member = timestamp:{gameId}
 * - Redis Hash: metrics:summary:{modelType}:{YYYY-MM-DD}
 *   total_requests, total_tokens_in, total_tokens_out,
 *   parse_success, parse_fail, fallback_draws, total_retries
 *
 * 메트릭 수집은 비즈니스 로직에 영향을 주지 않는다.
 * Redis 연결 실패 시에도 메트릭만 누락되고 서비스는 정상 동작한다.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  /** 메트릭 키 TTL: 30일 */
  private static readonly METRICS_TTL_SECONDS = 30 * 24 * 60 * 60;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * LLM 호출 메트릭을 기록한다.
   */
  async recordMetric(record: LlmMetricRecord): Promise<void> {
    try {
      const dateStr = record.timestamp.slice(0, 10); // YYYY-MM-DD
      const latencyKey = `metrics:latency:${record.modelType}:${dateStr}`;
      const summaryKey = `metrics:summary:${record.modelType}:${dateStr}`;
      const member = `${record.timestamp}:${record.gameId}`;

      const pipeline = this.redis.pipeline();

      // Sorted Set에 응답 시간 기록 (p50/p95 계산용)
      pipeline.zadd(latencyKey, record.latencyMs, member);

      // 집계 Hash 갱신
      pipeline.hincrby(summaryKey, 'total_requests', 1);
      pipeline.hincrby(summaryKey, 'total_tokens_in', record.promptTokens);
      pipeline.hincrby(summaryKey, 'total_tokens_out', record.completionTokens);
      pipeline.hincrby(
        summaryKey,
        record.parseSuccess ? 'parse_success' : 'parse_fail',
        1,
      );
      if (record.isFallbackDraw) {
        pipeline.hincrby(summaryKey, 'fallback_draws', 1);
      }
      pipeline.hincrby(summaryKey, 'total_retries', record.retryCount);
      pipeline.hincrby(summaryKey, 'total_latency_ms', record.latencyMs);

      // TTL 설정 (키가 처음 생성될 때만)
      pipeline.expire(latencyKey, MetricsService.METRICS_TTL_SECONDS, 'NX');
      pipeline.expire(summaryKey, MetricsService.METRICS_TTL_SECONDS, 'NX');

      await pipeline.exec();

      this.logger.debug(
        `[Metrics] ${record.modelType} latency=${record.latencyMs}ms tokens=${record.promptTokens}+${record.completionTokens}`,
      );
    } catch (err) {
      this.logger.warn(
        `[Metrics] Redis 기록 실패 (메트릭 누락): ${(err as Error).message}`,
      );
    }
  }

  /**
   * 특정 모델의 일별 메트릭 요약을 조회한다.
   */
  async getModelSummary(
    modelType: string,
    date?: string,
  ): Promise<ModelMetricsSummary> {
    const dateStr = date ?? this.todayDateString();
    const latencyKey = `metrics:latency:${modelType}:${dateStr}`;
    const summaryKey = `metrics:summary:${modelType}:${dateStr}`;

    try {
      const [summaryData, latencyCount] = await Promise.all([
        this.redis.hgetall(summaryKey),
        this.redis.zcard(latencyKey),
      ]);

      const totalRequests = parseInt(summaryData['total_requests'] ?? '0', 10);
      const totalLatencyMs = parseInt(
        summaryData['total_latency_ms'] ?? '0',
        10,
      );
      const parseSuccess = parseInt(summaryData['parse_success'] ?? '0', 10);
      const parseFail = parseInt(summaryData['parse_fail'] ?? '0', 10);
      const fallbackDraws = parseInt(summaryData['fallback_draws'] ?? '0', 10);
      const totalRetries = parseInt(summaryData['total_retries'] ?? '0', 10);

      // p50, p95 계산 (Sorted Set에서 인덱스 기반)
      let p50 = 0;
      let p95 = 0;
      if (latencyCount > 0) {
        const p50Index = Math.floor(latencyCount * 0.5);
        const p95Index = Math.floor(latencyCount * 0.95);

        const p50Members = await this.redis.zrange(
          latencyKey,
          p50Index,
          p50Index,
          'WITHSCORES',
        );
        const p95Members = await this.redis.zrange(
          latencyKey,
          p95Index,
          p95Index,
          'WITHSCORES',
        );

        p50 = p50Members.length >= 2 ? parseFloat(p50Members[1]) : 0;
        p95 = p95Members.length >= 2 ? parseFloat(p95Members[1]) : 0;
      }

      const totalParseAttempts = parseSuccess + parseFail;

      return {
        modelType,
        totalRequests,
        avgLatencyMs:
          totalRequests > 0 ? Math.round(totalLatencyMs / totalRequests) : 0,
        p50LatencyMs: Math.round(p50),
        p95LatencyMs: Math.round(p95),
        totalTokensIn: parseInt(summaryData['total_tokens_in'] ?? '0', 10),
        totalTokensOut: parseInt(summaryData['total_tokens_out'] ?? '0', 10),
        parseSuccessRate:
          totalParseAttempts > 0
            ? Math.round((parseSuccess / totalParseAttempts) * 10000) / 100
            : 100,
        fallbackDrawRate:
          totalRequests > 0
            ? Math.round((fallbackDraws / totalRequests) * 10000) / 100
            : 0,
        avgRetryCount:
          totalRequests > 0
            ? Math.round((totalRetries / totalRequests) * 100) / 100
            : 0,
      };
    } catch (err) {
      this.logger.warn(`[Metrics] Redis 조회 실패: ${(err as Error).message}`);
      return {
        modelType,
        totalRequests: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        parseSuccessRate: 100,
        fallbackDrawRate: 0,
        avgRetryCount: 0,
      };
    }
  }

  /**
   * 모든 모델의 일별 메트릭 요약을 조회한다.
   */
  async getAllModelSummaries(date?: string): Promise<ModelMetricsSummary[]> {
    const models = ['openai', 'claude', 'deepseek', 'ollama'];
    return Promise.all(
      models.map((model) => this.getModelSummary(model, date)),
    );
  }

  private todayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
