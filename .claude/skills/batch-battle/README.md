# AI 대전 배치 실행

> 사전점검 -> 정리 -> 실행 -> 모니터링 -> 정리. 빠뜨리면 망한다.

## 언제 사용하나

- AI 대전 테스트(multirun, 단일 모델 등) 배치 작업을 실행할 때
- 3모델(DeepSeek/GPT/Claude) 순차 대전을 돌릴 때
- 야간 장시간 배치를 백그라운드로 실행하고 모니터링할 때

## 핵심 흐름

1. **Phase 1 -- 사전점검**: K8s Pod, 서비스 헬스, Redis/PG, API 잔액, 비용 한도, DNS 검증, dry-run
2. **Phase 2 -- 사전 정리**: Redis game:* 0개 확인, 잔존 프로세스 kill, 모니터링 디렉터리 생성
3. **Phase 3 -- 실행 + 모니터링**: 모델별 순차 실행 (병렬 금지), 15분 주기 10개 지표 tick 보고, fallback 즉시 장애 보고
4. **Phase 4 -- 사후 정리**: 프로세스 트리 전체 kill, Redis 잔존 키 삭제, 비용 한도 평상시 복구
5. **Phase 5 -- 최종 보고**: 통계 집계, 모델별 에세이, 비용 잔액 갱신

## 관련 문서

- `docs/02-design/41-timeout-chain-breakdown.md` -- 타임아웃 체인 SSOT
- `docs/02-design/42-prompt-variant-standard.md` -- 프롬프트 variant SSOT
- `work_logs/monitoring/` -- 배치 모니터링 tick 기록

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-04-10 | v1.0 | 최초 작성 (좀비 게임 사고 교훈 체계화) |
| 2026-04-19 | v1.1 | false success 사고 반영 (dry-run, PIPESTATUS, 조기종료 감지) |
| 2026-04-20 | v1.2 | DNS 사전 검증(Phase 1c), 프로세스 트리 cleanup, 15분 tick 보고 추가 |
