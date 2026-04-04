import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * 모델별 토큰 단가 (USD per 1M tokens).
 * GPT-4o: input $2.5/1M, output $10/1M
 * Claude Sonnet: input $3/1M, output $15/1M
 * DeepSeek: input $0.14/1M, output $0.28/1M
 * Ollama: 로컬 실행이므로 비용 0
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  openai: { inputPer1M: 2.5, outputPer1M: 10.0 },
  claude: { inputPer1M: 3.0, outputPer1M: 15.0 },
  deepseek: { inputPer1M: 0.14, outputPer1M: 0.28 },
  ollama: { inputPer1M: 0, outputPer1M: 0 },
};

/**
 * LLM 호출 비용 기록 데이터.
 * 인터셉터가 LLM 호출 후 이 구조체를 전달한다.
 */
export interface CostRecord {
  modelType: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * 일별 비용 조회 응답 구조.
 */
export interface DailyCostSummary {
  date: string;
  totalCostUsd: number;
  totalRequests: number;
  models: Record<
    string,
    {
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      requests: number;
    }
  >;
  limitUsd: number;
  limitExceeded: boolean;
}

/** Redis Hash TTL: 30일 (초) */
const DAILY_KEY_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Redis Key TTL for hourly per-user tracking: 1시간 (초) */
const HOURLY_KEY_TTL_SECONDS = 3600;

/**
 * LLM API 호출 비용을 Redis Hash에 추적하는 서비스.
 *
 * Redis Key: quota:daily:{YYYY-MM-DD}
 * Fields:
 *   {model}:tokens_in   - 입력 토큰 누적
 *   {model}:tokens_out  - 출력 토큰 누적
 *   {model}:cost_usd    - 비용(USD) 누적 (정수, 소수점 6자리 = 1e6 스케일)
 *   {model}:requests    - 요청 횟수 누적
 *   total_cost_usd      - 전체 비용 누적 (1e6 스케일)
 *   total_requests      - 전체 요청 횟수 누적
 *
 * 비용은 정수 HINCRBY를 사용하기 위해 1,000,000 (1e6) 스케일로 저장한다.
 * 조회 시 1e6으로 나누어 USD 단위로 변환한다.
 */
@Injectable()
export class CostTrackingService {
  private readonly logger = new Logger(CostTrackingService.name);
  private readonly dailyCostLimitUsd: number;
  private readonly hourlyUserCostLimitUsd: number;

  /** 비용 정수 스케일 팩터 (소수점 6자리 정밀도) */
  private static readonly COST_SCALE = 1_000_000;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.dailyCostLimitUsd = this.configService.get<number>(
      'DAILY_COST_LIMIT_USD',
      5,
    );
    this.hourlyUserCostLimitUsd = this.configService.get<number>(
      'HOURLY_USER_COST_LIMIT_USD',
      5,
    );
    this.logger.log(
      `비용 추적 초기화: 일일 한도 $${this.dailyCostLimitUsd}, 시간당 사용자 한도 $${this.hourlyUserCostLimitUsd}`,
    );
  }

  /**
   * LLM 호출 비용을 Redis에 기록한다.
   * Redis 연결 실패 시에도 LLM 호출 자체는 차단하지 않는다 (로그만 남김).
   */
  async recordCost(record: CostRecord): Promise<void> {
    try {
      const dateKey = this.todayKey();
      const pricing = MODEL_PRICING[record.modelType] ?? MODEL_PRICING.ollama;

      // 비용 계산 (USD)
      const inputCost = (record.promptTokens / 1_000_000) * pricing.inputPer1M;
      const outputCost =
        (record.completionTokens / 1_000_000) * pricing.outputPer1M;
      const totalCost = inputCost + outputCost;

      // 정수 스케일 변환
      const costScaled = Math.round(totalCost * CostTrackingService.COST_SCALE);

      const model = record.modelType;
      const pipeline = this.redis.pipeline();

      // 모델별 누적
      pipeline.hincrby(dateKey, `${model}:tokens_in`, record.promptTokens);
      pipeline.hincrby(dateKey, `${model}:tokens_out`, record.completionTokens);
      pipeline.hincrby(dateKey, `${model}:cost_usd`, costScaled);
      pipeline.hincrby(dateKey, `${model}:requests`, 1);

      // 전체 누적
      pipeline.hincrby(dateKey, 'total_cost_usd', costScaled);
      pipeline.hincrby(dateKey, 'total_requests', 1);

      // TTL 설정 (키가 처음 생성될 때만)
      pipeline.expire(dateKey, DAILY_KEY_TTL_SECONDS, 'NX');

      await pipeline.exec();

      this.logger.debug(
        `[CostTracking] ${model}: in=${record.promptTokens} out=${record.completionTokens} cost=$${totalCost.toFixed(6)}`,
      );
    } catch (err) {
      // Redis 연결 실패 시에도 LLM 호출은 정상 진행 (비용 추적만 누락)
      this.logger.warn(
        `[CostTracking] Redis 기록 실패 (비용 추적 누락): ${(err as Error).message}`,
      );
    }
  }

  /**
   * 일일 비용 한도 초과 여부를 확인한다.
   * Redis 연결 실패 시에는 false를 반환하여 서비스를 차단하지 않는다.
   *
   * @returns true = 한도 초과, false = 정상 (또는 확인 불가)
   */
  async isDailyLimitExceeded(): Promise<boolean> {
    try {
      const dateKey = this.todayKey();
      const totalCostScaled = await this.redis.hget(dateKey, 'total_cost_usd');

      if (!totalCostScaled) {
        return false;
      }

      const totalCostUsd =
        parseInt(totalCostScaled, 10) / CostTrackingService.COST_SCALE;

      if (totalCostUsd >= this.dailyCostLimitUsd) {
        this.logger.warn(
          `[CostTracking] 일일 한도 초과: $${totalCostUsd.toFixed(2)} >= $${this.dailyCostLimitUsd}`,
        );
        return true;
      }

      return false;
    } catch (err) {
      this.logger.warn(
        `[CostTracking] Redis 한도 확인 실패 (허용으로 처리): ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * 특정 날짜의 비용 요약을 조회한다.
   * @param date YYYY-MM-DD 형식. 생략 시 오늘 날짜.
   */
  async getDailySummary(date?: string): Promise<DailyCostSummary> {
    const targetDate = date ?? this.todayDateString();
    const dateKey = `quota:daily:${targetDate}`;

    try {
      const data = await this.redis.hgetall(dateKey);

      const modelTypes = ['openai', 'claude', 'deepseek', 'ollama'];
      const models: DailyCostSummary['models'] = {};

      for (const model of modelTypes) {
        const tokensIn = parseInt(data[`${model}:tokens_in`] ?? '0', 10);
        const tokensOut = parseInt(data[`${model}:tokens_out`] ?? '0', 10);
        const costScaled = parseInt(data[`${model}:cost_usd`] ?? '0', 10);
        const requests = parseInt(data[`${model}:requests`] ?? '0', 10);

        // 데이터가 하나라도 있는 모델만 포함
        if (tokensIn > 0 || tokensOut > 0 || requests > 0) {
          models[model] = {
            tokensIn,
            tokensOut,
            costUsd:
              Math.round(
                (costScaled / CostTrackingService.COST_SCALE) * 1_000_000,
              ) / 1_000_000,
            requests,
          };
        }
      }

      const totalCostScaled = parseInt(data['total_cost_usd'] ?? '0', 10);
      const totalCostUsd =
        Math.round(
          (totalCostScaled / CostTrackingService.COST_SCALE) * 1_000_000,
        ) / 1_000_000;
      const totalRequests = parseInt(data['total_requests'] ?? '0', 10);

      return {
        date: targetDate,
        totalCostUsd,
        totalRequests,
        models,
        limitUsd: this.dailyCostLimitUsd,
        limitExceeded: totalCostUsd >= this.dailyCostLimitUsd,
      };
    } catch (err) {
      this.logger.warn(
        `[CostTracking] Redis 조회 실패: ${(err as Error).message}`,
      );
      return {
        date: targetDate,
        totalCostUsd: 0,
        totalRequests: 0,
        models: {},
        limitUsd: this.dailyCostLimitUsd,
        limitExceeded: false,
      };
    }
  }

  /**
   * 최근 N일간의 비용 요약을 조회한다.
   */
  async getRecentDays(days: number = 7): Promise<DailyCostSummary[]> {
    const summaries: DailyCostSummary[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = this.formatDate(date);
      const summary = await this.getDailySummary(dateStr);
      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * 사용자(또는 게임)별 시간당 비용을 Redis에 기록한다.
   *
   * Redis Key: quota:hourly:{userId}:{YYYY-MM-DD-HH}
   * 비용은 1e6 스케일 정수로 INCRBY 연산한다.
   * TTL은 1시간으로 자동 만료된다.
   *
   * Redis 연결 실패 시에도 LLM 호출을 차단하지 않는다 (로그만 남김).
   *
   * @param userId 사용자 ID 또는 게임 ID (rate limit 키로 사용)
   * @param record LLM 호출 비용 기록
   */
  async recordUserCost(userId: string, record: CostRecord): Promise<void> {
    try {
      const hourlyKey = this.hourlyUserKey(userId);
      const pricing = MODEL_PRICING[record.modelType] ?? MODEL_PRICING.ollama;

      const inputCost = (record.promptTokens / 1_000_000) * pricing.inputPer1M;
      const outputCost =
        (record.completionTokens / 1_000_000) * pricing.outputPer1M;
      const totalCost = inputCost + outputCost;
      const costScaled = Math.round(totalCost * CostTrackingService.COST_SCALE);

      const pipeline = this.redis.pipeline();
      pipeline.incrby(hourlyKey, costScaled);
      pipeline.expire(hourlyKey, HOURLY_KEY_TTL_SECONDS, 'NX');
      await pipeline.exec();

      this.logger.debug(
        `[CostTracking] 사용자 시간당 비용 기록: userId=${userId} cost=$${totalCost.toFixed(6)}`,
      );
    } catch (err) {
      this.logger.warn(
        `[CostTracking] 사용자 시간당 비용 기록 실패: ${(err as Error).message}`,
      );
    }
  }

  /**
   * 사용자(또는 게임)별 시간당 비용 한도 초과 여부를 확인한다.
   *
   * Redis 연결 실패 시에는 false를 반환하여 서비스를 차단하지 않는다 (가용성 우선).
   *
   * @param userId 사용자 ID 또는 게임 ID
   * @returns true = 한도 초과, false = 정상 (또는 확인 불가)
   */
  async isUserHourlyLimitExceeded(userId: string): Promise<boolean> {
    try {
      const hourlyKey = this.hourlyUserKey(userId);
      const costScaledStr = await this.redis.get(hourlyKey);

      if (!costScaledStr) {
        return false;
      }

      const costUsd =
        parseInt(costScaledStr, 10) / CostTrackingService.COST_SCALE;

      if (costUsd >= this.hourlyUserCostLimitUsd) {
        this.logger.warn(
          `[CostTracking] 사용자 시간당 한도 초과: userId=${userId} $${costUsd.toFixed(2)} >= $${this.hourlyUserCostLimitUsd}`,
        );
        return true;
      }

      return false;
    } catch (err) {
      this.logger.warn(
        `[CostTracking] 사용자 시간당 한도 확인 실패 (허용으로 처리): ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * 사용자별 시간당 비용 Redis Key를 반환한다.
   * 형식: quota:hourly:{userId}:{YYYY-MM-DD-HH}
   */
  private hourlyUserKey(userId: string): string {
    const now = new Date();
    const dateHour = `${this.formatDate(now)}-${String(now.getHours()).padStart(2, '0')}`;
    return `quota:hourly:${userId}:${dateHour}`;
  }

  /**
   * 오늘 날짜의 Redis Key를 반환한다.
   */
  private todayKey(): string {
    return `quota:daily:${this.todayDateString()}`;
  }

  private todayDateString(): string {
    return this.formatDate(new Date());
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
