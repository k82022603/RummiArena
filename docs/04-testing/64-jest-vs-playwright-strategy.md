# 64. Jest vs Playwright — 테스트 계층 전략

- **작성일**: 2026-04-21 (Day 11)
- **작성자**: Claude (Day 11 실측 세션 후속)
- **계기**: 옵션 B 7건 수정 세션 중 "Jest 단위 테스트가 해당 컴포넌트에 없음"을 발견. QA 리포트에서도 "1528개 테스트가 오늘의 P0 4건을 왜 못 잡았는가?"라는 구조적 질문 제기.

## 1. 현황 — RummiArena 테스트 인벤토리 (2026-04-21 Day 11 EOD 기준)

| 서비스 | Jest (단위/통합) | Playwright (E2E) | 인프라 상태 |
|--------|-----------------|------------------|-------------|
| **game-server** (Go) | 689 PASS (7 packages) | — | `go test` 표준 |
| **ai-adapter** (NestJS) | **428/428 PASS** (20 suites) | — | Jest 내장 |
| **frontend** (Next.js) | **59 PASS (5 suites, Day 11 신규 구축)** | **390개** (376 PASS / 4 Known / 10 Flaky) | **Day 11 Jest 인프라 신설** |
| **admin** (Next.js) | ❌ 0개 | 일부 포함 | Playwright only (Sprint 7 대상) |

**Day 11 변동 (2026-04-21)**: frontend 에 Jest + Testing Library 인프라 신설, 오늘 UI 수정 7건 중 5건에 대한 단위 테스트 59개 추가 (player-display 13, gameStore 8, PlayerCard 12, ActionBar 10, Tile 16). 전체 실행 시간 약 86초.

**결정적 사실**: 프론트엔드 2개 서비스(frontend, admin)는 `package.json`에 `@playwright/test`만 있고 `jest`/`@testing-library/react`/`jsdom` 일체 없음. `jest.config.*`도 `*.test.ts*`도 하나도 없는 상태로 초기 구축됨.

## 2. 도구 비교 — 책임과 강점

### 2.1 역할 매트릭스

|  | **Jest (단위)** | **Playwright (E2E)** |
|---|---|---|
| **테스트 대상** | 함수, 모듈, 컴포넌트 단위 | 사용자 플로우 전체 |
| **실행 환경** | jsdom 또는 node | 실제 브라우저 (chromium/webkit) |
| **격리 수준** | 완전 격리 (mock 의존성) | 실제 서버·DB·WS 포함 |
| **속도** | 1 테스트 1~50ms | 1 테스트 1~30s |
| **디버깅** | 스택 트레이스 직접 | 스크린샷·trace.zip·video |
| **비결정성** | 낮음 (mock 고정) | 중간 (네트워크/타이밍) |
| **커버리지 측정** | istanbul 정확 | playwright-coverage (간접) |
| **CI 비용** | 매우 낮음 | 높음 (병렬 제한·환경 준비) |

### 2.2 무엇을 잡는가

**Jest**가 잘 잡는 것:
- 순수 함수의 경계값 / undefined / null 케이스 (오늘 P0-3 `else → 고수` 류)
- selector/reducer 분기 (오늘 P1-3 `selectMyTileCount`)
- 컴포넌트 prop 변화에 따른 렌더 분기 (오늘 P0-4 persona 없을 때 괄호 제거)
- 타입 경계 위반 (TS 컴파일만으로는 놓치는 런타임 분기)

**Playwright**가 잘 잡는 것:
- 사용자 관점 end-to-end 시나리오 (로그인→방생성→게임종료)
- 드래그앤드롭, 포커스 이동, 키보드 네비게이션
- 실제 CSS 렌더링 (오늘 P2-3/4 Tile 실측 크기 검증)
- WS 실시간 동기화 (다자 클라이언트)
- CLS / LCP / INP 등 Core Web Vitals 지표

### 2.3 양쪽 다 필요한 것 (중첩 계층 방어)

- **AI persona 표시** 같은 단순 로직 → Jest가 0.01s에 잡아야 함. Playwright만 있으면 회귀 감지가 늦음.
- **게임 종료 → UI stale** 같은 계약 위반 → Playwright만 잡을 수 있음. Jest로는 서버-클라이언트 경계 테스트 불가.

## 3. 오늘 사례 분석 — 1528 테스트가 P0 4건을 못 잡은 이유

QA 최종 판정에서 식별한 **구조적 gap 3종**:

### gap-A: 프론트엔드 단위 테스트 인프라 부재

- 이번 P0-3 (difficulty `else → 고수`) · P0-4 (persona 빈 괄호) 는 **단일 함수의 경계값 버그**.
- jsdom + Testing Library 로 5초면 잡을 수 있는 문제를 **Playwright E2E로 간접 검증**하려니 누락됨.
- 근본 원인: frontend 초기 구축 시 단위 테스트 스택 생략.

### gap-B: WS 이벤트 ↔ UI 상태 계약 테스트 부재

- P0-2 (게임 종료 방송 누락) 는 Jest도 Playwright도 잡지 못함.
- 필요한 것은 **서버가 보낸 이벤트와 UI가 받은 결과가 일치하는가**를 검증하는 **contract test**.
- 현재 game-server Jest는 서버 단독, Playwright는 클라이언트 단독. 경계가 비어 있음.

### gap-C: DB 영속화 회귀 테스트 부재

- P0-1 (games/game_events/ai_call_logs count=0) 는 **게임 1판 완주 후 DB row 단언**이 있었다면 잡힘.
- 기존 `ai-battle` 스크립트는 WS 종료만 확인하고 DB 검증 생략.

## 4. 권장 계층 전략 (테스트 피라미드)

```
              ┌──────────────────────────┐
              │  E2E (Playwright)          │  느림, 비결정, 비쌈
              │  - 핵심 사용자 플로우       │  목표: 50~100개
              │  - CLS/Core Web Vitals     │
              └──────────────────────────┘
            ┌──────────────────────────────┐
            │ Contract (WS / API)            │  중간
            │ - server↔client 이벤트 계약     │  목표: 20~50개
            │ - DB 영속화 회귀               │  (신규 카테고리)
            └──────────────────────────────┘
      ┌────────────────────────────────────────┐
      │ Unit / Integration (Jest)                │  빠름, 결정적
      │ - 순수 함수 / selector / component 분기   │  목표: 200~500개
      │ - reducer / validator / formatter        │  (현재 0개, 우선 구축)
      └────────────────────────────────────────┘
```

### 4.1 계층별 투자 방향

| 계층 | 현재 | 목표 (Sprint 7 말) | 우선순위 |
|------|------|-------------------|----------|
| Unit (Jest) — frontend | 0 | **100+ 최소** | **P0** (본 문서 기인) |
| Unit (Jest) — ai-adapter | 428 | 500+ | P2 (유지) |
| Unit (Go) — game-server | 689 | 800+ | P2 (유지) |
| Contract (WS/API) | 0 | **30+** | P1 (Sprint 7) |
| E2E (Playwright) | 390 | 400+ | P3 (유지) |
| DB 영속 회귀 | 0 | **10+** | P0 (Day 12 Backend 세션) |

### 4.2 테스트 작성 우선순위 (frontend Jest)

본 문서 작성 직후 Sprint 6 잔여 기간에 작성할 단위 테스트:

1. `lib/player-display.ts` — 순수 함수 (오늘 신설 헬퍼)
2. `store/gameStore.ts` — selector (selectMyTileCount)
3. `components/game/PlayerCard.tsx` — difficulty fallback / persona 조립
4. `components/game/ActionBar.tsx` — disabled 조건 분기
5. `components/tile/Tile.tsx` — SIZE_CLASS variant 렌더

이후 Sprint 7:

6. `types/tile.ts` parseTileCode / 보드 validator 순수 로직
7. `store/wsStore.ts` 이벤트 핸들러 reducer
8. `hooks/useTurnTimer.ts` 타이머 로직
9. `store/rackStore.ts` 드래그앤드롭 상태 전이 (rack 재배치)

## 5. Next.js 15 + Jest 설치 가이드

### 5.1 의존성 (Next.js 공식 가이드 기반)

```bash
npm install --save-dev \
  jest jest-environment-jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  @types/jest
```

### 5.2 설정 파일

**jest.config.ts** (Next.js SWC + TypeScript)
```ts
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config = {
  setupFilesAfterEach: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jsdom',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/e2e/',
    '<rootDir>/test-results/',
    '<rootDir>/playwright-report/',
  ],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
};

export default createJestConfig(config);
```

**jest.setup.ts**
```ts
import '@testing-library/jest-dom';
```

**package.json scripts**
```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage"
```

### 5.3 haste collision 회피

`.next/standalone/package.json` 과 루트 `package.json` 이 같은 `name`을 가지면 Jest haste-map 충돌. `modulePathIgnorePatterns: ['<rootDir>/.next/']` 로 해결. 오늘 초기 시도에서 이 이슈 실측함.

## 6. CI 통합 방향 (후속)

- **GitLab CI**: 기존 `test-frontend-e2e` stage 앞에 `test-frontend-unit` stage 추가
- **게이트**: Jest 실패 시 E2E 실행 차단 (fast-fail)
- **커버리지**: `jest --coverage` → SonarQube 전송 (기존 game-server와 동일 패턴)
- **타임박스**: Jest 전체 suite 30초 이하 유지 (현재 ai-adapter 80초 참고)

## 7. 도입 효과 (예측)

- **속도**: 오늘 P0-3/P0-4 류 버그는 사전 단위 테스트로 커밋 직전 잡힘 → 라이브 테스트 부담 감소
- **유지보수성**: difficulty fallback 같은 분기 로직 변경 시 회귀 방지 게이트
- **CI 비용**: Jest 병렬 실행으로 Playwright 부담 감소
- **개발 속도**: watch 모드로 TDD 가능, 현재 Playwright 10s/test는 TDD 부적합

## 8. 결론 및 실행 계획

### 결론

- **frontend는 지금까지 Jest 인프라 없이 Playwright E2E만으로 운영됐음**.
- 이는 Next.js 14~15 공식 권장 (`jest + @testing-library/react`) 을 벗어나는 구축이며, 오늘 발견된 P0-3/P0-4 류 버그의 주요 원인.
- 이 문서 작성과 함께 **Sprint 6 말 ~ Sprint 7 초에 Jest 인프라 구축 + 최소 5 테스트 파일 작성** 이 Day 11 세션의 액션 아이템으로 확정.

### 실행 계획 (본 문서 연동)

| 단계 | 산출 | 상태 |
|------|------|------|
| 1. 비교 전략 문서 (본 문서) | `docs/04-testing/64` | ✅ 완료 |
| 2. Jest 인프라 설치·설정 | `jest.config.js`, `package.json` scripts 3개 | ✅ 완료 |
| 3. player-display 단위 테스트 | `src/lib/__tests__/player-display.test.ts` (13 tests) | ✅ 완료 |
| 4. gameStore selector 단위 테스트 | `src/store/__tests__/gameStore.test.ts` (8 tests) | ✅ 완료 |
| 5. PlayerCard 렌더 단위 테스트 | `src/components/game/__tests__/PlayerCard.test.tsx` (12 tests) | ✅ 완료 |
| 6. ActionBar disabled 단위 테스트 | `src/components/game/__tests__/ActionBar.test.tsx` (10 tests) | ✅ 완료 |
| 7. Tile SIZE_CLASS 단위 테스트 | `src/components/tile/__tests__/Tile.test.tsx` (16 tests) | ✅ 완료 |
| 8. 전체 실행 검증 | `npm test` → 59/59 PASS, 86s | ✅ 완료 |

### 5.x 구축 중 발견한 이슈 (후속 유지보수 참고)

1. **Jest config TS 파일 비권장**: `jest.config.ts` 는 `ts-node` 추가 의존을 유발. `jest.config.js` (CommonJS) 로 작성하는 편이 가볍고 Next.js 공식 가이드와 일치.
2. **`setupFilesAfterEach` 옵션이 Jest 29에서 Unknown 경고**: next/jest 래핑 하에서 해당 옵션이 유효하지 않다고 경고. **회피책**: `@testing-library/jest-dom` 을 각 테스트 파일 최상단에서 직접 import. jest.config.js 에 setup 파일 등록 불필요.
3. **haste collision (`.next/standalone/package.json`)**: `modulePathIgnorePatterns: ['<rootDir>/.next/']` 로 해결.
4. **Framer Motion + jsdom**: 컴포넌트 테스트 시 animate 속성이 jsdom 에서 무시되지만 throw 하지는 않음. visible/disabled 같은 최종 상태만 단언하면 됨.

## 9. 관련 문서

- `docs/04-testing/13-test-strategy.md` (기존 테스트 전략 문서)
- `docs/04-testing/63-v6-shaper-final-report.md` (직전 테스트 보고서)
- `work_logs/sessions/2026-04-21-01.md` (오늘 세션 로그)
- `work_logs/scrums/2026-04-21-01.md` (오늘 스크럼)

## 10. 변경 이력

- **2026-04-21 v1.0**: 최초 작성. Day 11 UI 버그 수정 세션 중 "frontend Jest 인프라 부재" 실측 발견에 대응.
