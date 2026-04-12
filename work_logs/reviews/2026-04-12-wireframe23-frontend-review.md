# AI 토너먼트 대시보드 와이어프레임 재검토 (Frontend Dev)

- **리뷰어**: frontend-dev
- **날짜**: 2026-04-12
- **대상**: `docs/02-design/23-ai-tournament-dashboard-wireframe.md` (894줄)
- **목적**: Sprint 6(2026-04-13~) 구현 착수 전 기술 타당성 검토
- **범위**: 기술/구현 관점 (시각 디자인은 Designer 컴포넌트 스펙 30번 담당)

---

## 1. 요약

와이어프레임은 **admin 프로젝트(`src/admin`)에 신규 `/tournament` 라우트를 추가**하는 방향으로 설계되어 있으며, 기존 admin 스택(Next.js 16.1.6 + recharts 3.8 + React 19)과 **시각/UI 스택 관점에서는 완전히 호환**된다. 모델 색상 토큰·CSS 변수·반응형 그리드는 별도 의존성 추가 없이 즉시 구현 가능하다.

그러나 **데이터 소스 관점에서 근본적인 Gap이 존재**한다. 와이어프레임이 참조하는 `docs/02-design/13-llm-metrics-schema-design.md`의 LLM 메트릭 테이블(`ai_move_metrics`, `ai_game_summary`)은 아직 구현되어 있지 않고, 유일하게 준비된 `AICallLog` 모델(`src/game-server/internal/model/event.go:56`)조차 **어디서도 insert되지 않는 빈 테이블**이다(grep 결과: `AutoMigrate` 등록 외 참조 0건). 즉 토너먼트 결과 데이터는 **현재 `scripts/ai-battle-*-results-*.json` 파일에만 존재**하며, 이를 DB로 흡수하는 경로가 없다.

결론: **Conditional Ready**. UI 구현은 즉시 착수 가능하되, 선결 과제 3건(데이터 수집 경로, admin API 신설, 정적 JSON 임시 소스) 중 최소 1건이 확정되어야 PR 머지가 의미를 가진다.

---

## 2. 스택 호환성 (A)

### 2.1 admin 프로젝트(배치 대상)

| 항목 | 현재 | 와이어프레임 요구 | 호환 |
|------|------|------------------|:---:|
| Next.js | 16.1.6 (app router) | app router 전제 | OK |
| React | 19.2.3 | 19.x 전제 | OK |
| recharts | 3.8.0 (이미 `StatsChart.tsx`에서 사용) | LineChart/ScatterChart/ZAxis | OK |
| @types/recharts | 1.8.29 | 동일 | OK |
| Tailwind | v4 (`@tailwindcss/postcss`) | v3 클래스 문법 사용 | 주의 |
| Framer Motion | 없음 | 섹션 11.3 애니메이션 "fadeInUp" 언급 | 선택적 |
| dnd-kit | 없음 | 사용 안 함 | N/A |
| next-auth | 없음 (admin은 자체 `lib/auth.ts`) | 영향 없음 | OK |

참조: `src/admin/package.json:1-29`, `src/admin/src/components/StatsChart.tsx:1-60`

### 2.2 주의점

- **Tailwind v4 vs 와이어프레임 v3 문법**: 섹션 11.2의 `@apply bg-slate-800 border border-slate-700` 같은 클래스는 v4에서도 동작하지만, 커스텀 색상 변수(`--model-gpt` 등)는 v4의 `@theme` 블록에 등록하는 것이 관례이다. `src/admin/src/app/globals.css`에서 v4 방식으로 통일할 것.
- **Framer Motion 도입 여부**: 섹션 11.3의 `fadeInUp` 순차 딜레이는 CSS `animation-delay` + `@keyframes`로 충분하며, admin에는 아직 framer-motion이 없으므로 **MVP에서는 CSS만 사용**을 권장. 의존성 무증설.
- **frontend 프로젝트(`src/frontend`)와의 분리 재확인**: 와이어프레임 섹션 3.1~3.2는 `src/admin/src/app/tournament/`에 배치한다고 명시했다. 게임 플레이어용 `src/frontend`에는 토너먼트 페이지가 들어가지 않는다. 두 프로젝트는 별도 Dockerfile·Next 버전·Tailwind 버전이므로 **컴포넌트 직접 공유 금지**. 필요 시 복사본으로 시작한다.

---

## 3. 데이터 소스 & API Gap (B)

### 3.1 현재 상태 (2026-04-12 기준)

| 경로 | 상태 | 근거 |
|------|------|------|
| `AICallLog` 모델 정의 | 존재 | `src/game-server/internal/model/event.go:56` |
| `ai_call_log` 테이블 생성 | 존재 (AutoMigrate) | `src/game-server/internal/infra/database.go:74` |
| `AICallLog` insert 코드 | **없음** | grep `AICallLog\{|\.Create\(.*aiCall` → 0건 |
| `ai_move_metrics` / `ai_game_summary` 테이블 | **없음** | 설계 13번만 존재 |
| `/admin/stats/ai` 엔드포인트 | 있으나 Stub | `admin_service.go:183-196` — `AvgResponseTime: 0, ModelStats: []` 하드코딩 |
| admin `/admin/stats/ai-models` 호출 | 400/404 → fallback `[]` | `src/admin/src/lib/api.ts:163-173` |
| 토너먼트 raw 데이터 | **JSON 파일** | `scripts/ai-battle-3model-r4-results-*.json` (123~수천 줄) |

JSON 파일 포맷 샘플 (`ai-battle-3model-r4-results-deepseek-run1-20260411_134046.json:1-30`):
```json
{
  "tournament": "3-model Round 4",
  "timestamp": "2026-04-11 16:15:56",
  "config": {"maxTurns": 80, "persona": "calculator", "difficulty": "expert", "psychologyLevel": 2},
  "models": [{
    "modelKey": "deepseek", "modelName": "DeepSeek Reasoner",
    "totalTurns": 80, "aiTurns": 39, "aiPlace": 13, "aiTilesPlaced": 28,
    "aiDraw": 26, "aiFallback": 0, "placeRate": 33.3, "elapsed": 9309.8,
    "estimatedCost": 0.039, "result": "TIMEOUT",
    "responseTime": {"avg": 238.7, "p50": 219.7, "min": 140.3, "max": 435.1},
    "placeDetails": [{"turn": 2, "tiles": 3, "cumulative": 3, "resp_time": 196.4}, ...]
  }]
}
```

이 JSON은 사실상 `TournamentRoundEntry`(와이어프레임 섹션 6.3)의 1:1 매핑이 **이미 가능한** 수준으로 정제되어 있다. `round`와 `promptVersion` 필드만 파일명/디렉토리 규약으로 보강하면 된다.

### 3.2 섹션별 API Gap

| 섹션 | 필요 API | 기존 여부 | 신규 필요 | 비고 |
|------|---------|:--------:|:--------:|------|
| TournamentFilter | - (클라이언트 상태) | N/A | N/A | URL 쿼리 동기화만 필요 |
| PlaceRateChart | `GET /admin/stats/ai/tournament` | **없음** | **필요** | `TournamentSummary` 반환 |
| CostEfficiencyScatter | 동일 (같은 응답 재사용) | **없음** | **필요** | `costEfficiency: CostEfficiencyEntry[]` |
| ModelCard (×4) | 동일 (같은 응답) | **없음** | **필요** | `modelStats: ModelLatestStats[]` |
| RoundHistoryTable | 동일 | **없음** | **필요** | `rounds: TournamentRoundEntry[]` |
| 라운드 상세 페이지 | `GET /admin/stats/ai/tournament/:roundId` | **없음** | **필요** (Phase 2) | 턴별 `placeDetails` 배열 |
| 필터 연동 비교 | `GET /admin/stats/ai/tournament/compare` | **없음** | **선택적** | MVP는 클라이언트 필터링으로 대체 가능 |

### 3.3 데이터 소스 선택지 (선결 의사결정)

**옵션 A: 정적 JSON 임시 소스 (Fastest, MVP용)**
- `scripts/ai-battle-*-results-*.json`을 빌드 타임에 병합 → `src/admin/public/data/tournament.json` 생성
- admin 앱이 `fetch('/data/tournament.json')`로 로드
- 장점: game-server 의존성 0, Sprint 6 내 완결 가능
- 단점: 새 대전 실행 시 빌드 재배포 필요, 실시간 X

**옵션 B: game-server raw JSON 프록시 (Middle)**
- game-server에 `/admin/stats/ai/tournament` 엔드포인트 신설 → `scripts/` 디렉토리의 최신 JSON을 파일시스템에서 읽어 반환
- 장점: 빌드 재배포 불필요, 옵션 A의 API 스키마를 그대로 재사용
- 단점: game-server 컨테이너에 `scripts/` 경로 볼륨 마운트 필요 (K8s ConfigMap 또는 PVC)

**옵션 C: 정식 LLM 메트릭 테이블 구현 (Proper)**
- 설계 13번을 실제로 구현: `ai_move_metrics`, `ai_game_summary` 테이블 + `handleAITurn`에 insert 추가 + 집계 쿼리 + 엔드포인트
- 장점: 실시간, 정식 경로, 설계 일관성
- 단점: **AI Engineer + Game Server Dev 협업 필수**, Sprint 6 범위 초과 우려 (예상 8~13 SP 추가)

**Frontend Dev 권고**: **Sprint 6는 옵션 A + 옵션 B 혼합** — Sprint 6 초반 1~2일 내 옵션 B 엔드포인트를 game-server에 추가하고, 프론트는 옵션 A JSON 포맷으로 개발. 옵션 C는 Sprint 7 이후로 이월. 이렇게 하면 UI 작업과 백엔드 작업이 병렬 진행되고, API 계약만 맞으면 나중에 옵션 C로 교체 시 프론트 변경은 0이다.

---

## 4. 구현 난이도 (C)

| # | 섹션 | 난이도 | SP | 주요 이유 |
|---|------|:------:|:--:|-----------|
| 1 | TournamentFilter | **Low** | 1.0 | `useState` + `useSearchParams` + `router.replace`. URL 동기화는 기존 패턴 없으나 Next.js 표준 |
| 2 | PlaceRateChart | **Medium** | 2.0 | recharts LineChart + **CustomizedDot** (4가지 도형) + strokeDasharray v1/v2 구분. 미완주 표현(open marker)이 까다로움 |
| 3 | CostEfficiencyScatter | **Medium** | 2.0 | ScatterChart + **ZAxis**(버블 크기) + **4사분면 ReferenceArea** 2개. recharts에서 처음 사용하는 API |
| 4 | ModelCard | **Low-Medium** | 1.5 | 스파크라인 라인차트 mini + 등급 배지 + 상단 컬러 바. 반복 컴포넌트 |
| 5 | RoundHistoryTable | **Low** | 1.5 | 정렬 토글(로컬 state), 조건부 색상. 페이지네이션은 MVP 불필요 |
| 6 | ModelLegend | **Low** | 0.5 | 순수 표시 컴포넌트 |
| 7 | API 클라이언트 확장 | **Low** | 0.5 | 기존 `fetchApi` 재사용, 타입 3개 추가 |
| 8 | 라운드 상세 페이지 | **Medium-High** | 3.0 | `placeDetails` 기반 3종 차트 (타임라인/누적/히스토그램). 옵션 B 엔드포인트 필요 |
| 9 | 반응형 최적화 | **Medium** | 1.0 | 모바일 캐러셀은 별도 로직 (dnd-kit X, swiper X, CSS snap 권장) |
| 10 | 필터 ↔ 차트 연동 | **Low** | 0.5 | 클라이언트 사이드 필터 (fetch 1회 후 useMemo) |
| 11 | 로딩/에러/빈 상태 | **Low** | 0.5 | 스켈레톤 + fallback 문구 |
| 12 | a11y (aria-label, 키보드) | **Low** | 0.5 | 기존 admin 패턴 계승 |

**총 프론트 SP**: **14.5 SP** (와이어프레임 섹션 12.의 자체 추정과 일치)
**선결 백엔드 SP**: 옵션 B 선택 시 추가 **2~3 SP** (Go 핸들러 + 파일 스캔 로직)

---

## 5. 재사용 후보 (D)

### 5.1 admin 내부 재사용

| 기존 파일 | 용도 | 재사용 방식 |
|-----------|------|-------------|
| `src/admin/src/components/StatsChart.tsx` | 기존 recharts BarChart | **스타일 참조만** (`CartesianGrid stroke="#334155"`, `XAxis tick color`, `Tooltip contentStyle`) — `tooltipStyles` 상수 추출 권장 |
| `src/admin/src/components/Sidebar.tsx:12` | `NAV_ITEMS` 배열 | **직접 수정**: `{ href: "/tournament", label: "토너먼트 결과", icon: "trophy-chart" }` 추가. `NavIcon` 함수에 새 아이콘 case 추가 필요 |
| `src/admin/src/lib/api.ts:70` | `fetchApi<T>` 헬퍼 | **그대로 재사용** — `getTournamentSummary()` 등 신규 함수가 이 헬퍼를 호출 |
| `src/admin/src/lib/types.ts` | 타입 정의 위치 | `TournamentRoundEntry`, `CostEfficiencyEntry`, `ModelLatestStats`, `TournamentSummary` 추가 (섹션 6.3 그대로) |
| `src/admin/src/app/stats/page.tsx` | 서버 컴포넌트 + `dynamic = "force-dynamic"` 패턴 | **레이아웃 템플릿으로 참조** — `force-dynamic` + `Promise.all`로 다중 fetch |
| `src/admin/src/app/rankings/page.tsx` (+ `EloRankingPanel.tsx`) | 클라이언트 컴포넌트 분리 패턴 | **구조 참조** — 필터 UI는 `"use client"` 래퍼로 분리하고, 데이터 페치는 서버 컴포넌트에서 |

### 5.2 신규 생성 필요

- `src/admin/src/app/tournament/page.tsx` (서버 컴포넌트, Promise.all fetch)
- `src/admin/src/app/tournament/components/` 6개 파일 (와이어프레임 섹션 3.2 그대로)
- `src/admin/src/app/tournament/[roundId]/page.tsx` (Phase 2)
- `src/admin/src/lib/tournament-colors.ts` (모델 색상 토큰 상수화 — `--model-gpt` 등을 JS 객체로 export하여 recharts `stroke`/`fill`에 직접 주입)

### 5.3 frontend 프로젝트에서 가져올 것

- **없음**. `src/frontend`는 Tailwind v3 + Next 15 + recharts 미사용으로 스택이 다르다. 타일 색상 토큰(`tile-red` 등)은 이름만 유사할 뿐 목적이 다르므로 admin에서 별도 정의한다.

---

## 6. 누락/모호 포인트 (E) — Designer/PM 확인 필요

1. **"R4v2" 식별자 규약**: 와이어프레임은 X축 레이블로 `R2, R3, R4, R4v2`를 사용하지만 (9.1절), 이것이 DB key인지 UI 표시 문자열인지 불분명. 파일명 규약(`ai-battle-multirun-*-run1-*.json`)과 매핑 규칙 필요.
2. **필터 "라운드 범위" 드롭다운**: 섹션 5.1에서 `roundRange: [string, string]` 튜플이라 했으나 라운드가 시계열적이지 않고 이산(discrete) 값이라 "범위" 개념 모호. **체크박스 다중 선택**이 실제 사용성에 맞을 것.
3. **Ollama 데이터 표시 규칙**: 9.3절 모든 값이 `-`/`[]`이다. ModelCard에서 Ollama는 **비활성 카드(dimmed)** 로 표시할지, 아예 숨길지 결정 필요. `selectedModels` 기본값에서 Ollama 제외(`['gpt', 'claude', 'deepseek']`)는 합리적이나 사용자가 체크했을 때의 빈 상태 UX를 정의해야 한다.
4. **프롬프트 버전 v1/v2 판별 필드**: `TournamentRoundEntry.promptVersion`이 응답에 포함되어야 하는데, `scripts/ai-battle-*-results-*.json`의 현재 포맷에는 이 필드가 없다. 파일명으로 추론(`multirun` = v2?)하거나 `config.promptVersion`을 스크립트에 추가해야 한다 — **AI Engineer 협의 필요**.
5. **실시간 업데이트 정책**: 섹션 11 애니메이션은 **초기 로드 1회** 전제로 서술되어 있고, 섹션 13 "성능"에도 "초기 로드 시 모든 데이터 1회 fetch (탭 전환 없음)" 명시. 그러나 대시보드 맨 상단에 `lastUpdated: string` 필드(섹션 6.3)가 있어 polling/refresh 인터랙션이 기대되는지 불명확. **권고: MVP는 수동 새로고침 버튼만**.
6. **라운드 상세 URL 스킴**: 섹션 10은 `/tournament/R4-deepseek` 예시인데, dynamic segment 이름이 `[roundId]`이므로 값이 `R4-deepseek`(round+model 복합키)인지, 아니면 round만(`R4`)이고 model은 query인지 불명확. **`/tournament/[round]/[model]` 2단 segment 권장**.
7. **CSV/PNG export**: 와이어프레임에 없으나 대시보드 성격상 관리자가 요구할 가능성 높음. MVP 후순위 명시 필요.
8. **i18n**: 모든 레이블이 한글인데 영문 전환 스위치 여부 명시 없음. 기존 admin 패턴 따라 한글 전용 유지 권장.

---

## 7. Sprint 6 PR 분할 제안 (F)

### 전제 조건
- Sprint 6 첫날(04-13) game-server에 옵션 B 엔드포인트 선 추가 (Go dev 담당, 2~3 SP)
- 프론트는 엔드포인트 Stub(정적 JSON 반환) 상태에서 병렬 개발 가능

### PR 분할

**PR #1: 기반 구조 + 색상 토큰 + 사이드바 (0.5일, ~2 SP)**
- `src/admin/src/lib/tournament-colors.ts` 신설 (4개 모델 × 주/보조 색상)
- `src/admin/src/lib/types.ts` 확장 (4개 interface)
- `src/admin/src/lib/api.ts` 확장 (`getTournamentSummary` stub)
- `src/admin/src/components/Sidebar.tsx` NAV_ITEMS 한 줄 추가 + `trophy-chart` 아이콘 SVG
- `src/admin/src/app/tournament/page.tsx` 골격 (서버 컴포넌트, loading/error 상태만)
- `src/admin/src/app/globals.css` CSS 변수 `--model-*` 등록
- 머지 후: 페이지 접근은 되지만 차트는 비어있음

**PR #2: ModelCards + ModelLegend + TournamentFilter (1일, ~3 SP)**
- `ModelCard.tsx`, `ModelLegend.tsx`, `TournamentFilter.tsx`
- URL 쿼리 동기화 (필터 상태)
- 페이지에 3 컴포넌트 연결 — 아직 차트는 placeholder
- 머지 후: 필터링 + 4장 카드 동작

**PR #3: PlaceRateChart (1일, ~2.5 SP)**
- `PlaceRateChart.tsx` + `CustomizedDot` (4가지 도형)
- v1/v2 점선 구분 (`strokeDasharray`)
- 미완주 마커(open stroke)
- 호버 툴팁 커스텀
- Tooltip 공용 스타일 상수 추출 (`StatsChart.tsx`와 공유)

**PR #4: CostEfficiencyScatter + RoundHistoryTable (1일, ~3.5 SP)**
- ScatterChart + ZAxis + ReferenceArea 2개 (4사분면)
- RoundHistoryTable 정렬 + 상태 배지 + 조건부 Rate 색상
- 행 클릭 → `/tournament/[round]/[model]` 네비게이션 (상세 페이지는 후속 PR)

**PR #5: 라운드 상세 페이지 + 반응형 + a11y 보강 (1~1.5일, ~3.5 SP)**
- `[round]/[model]/page.tsx` (턴별 타임라인/누적/히스토그램)
- 반응형 모바일 캐러셀 (CSS scroll-snap)
- 키보드 네비게이션 / aria-sort / sr-only 테이블
- E2E 최소 1건 (페이지 로드 + 필터 변경 1회)

**총 예상 기간**: 4.5~5일 / 약 14.5 SP (와이어프레임 추정과 일치)

### PR 경계 설계 원칙

- 각 PR은 **단독으로 배포 가능**하며 이전 PR의 placeholder를 점진 교체
- PR #3, #4는 **병렬 작업 가능** (파일 충돌 없음)
- API 데이터 소스가 옵션 A → 옵션 C로 교체되어도 **PR #2 이후 수정 불필요** (타입 계약만 유지)

---

## 8. 리스크 & 선결 과제

### 8.1 기술 리스크

| # | 리스크 | 가능성 | 영향 | 완화책 |
|---|--------|:------:|:----:|--------|
| R1 | 데이터 소스 미정 → UI 완성 후에도 실데이터 연결 실패 | **High** | High | 섹션 3.3 옵션 B 선결정 (Day 1) |
| R2 | recharts ZAxis/ReferenceArea 학습 곡선 | Medium | Low | PR #4 전에 1~2시간 spike 권장 |
| R3 | Tailwind v4 커스텀 변수 등록 방식이 v3와 달라 토큰이 안 먹음 | Medium | Low | PR #1에서 첫 색상 1개로 검증 후 전체 적용 |
| R4 | `AICallLog` insert 미구현 이슈 → **Sprint 6에서 옵션 C까지 기대치 올라가면** 범위 폭발 | Medium | **High** | PM 확인: 옵션 B로 Sprint 6 마감 + 옵션 C는 Sprint 7 이월 |
| R5 | 라운드 상세 `placeDetails` 배열이 JSON에만 있고 DB 마이그레이션 안 됨 → 상세 페이지 구현 차단 | Medium | Medium | 옵션 B 엔드포인트가 JSON raw 그대로 반환하도록 합의 |
| R6 | Sidebar 아이콘 `trophy-chart` 신규 SVG 필요 | Low | Low | heroicons `chart-bar` + `trophy` 조합 또는 lucide-react 도입 |

### 8.2 선결 과제 (Ready 전환 조건)

1. **[PM]** 데이터 소스 옵션 A/B/C 의사결정 — **Sprint 6 Day 1 오전까지**
2. **[Go Dev]** 옵션 B 선택 시 `GET /admin/stats/ai/tournament` 엔드포인트 스펙 합의 (응답 스키마 = 와이어프레임 섹션 6.3) — **Day 1 종료 전**
3. **[AI Engineer]** `ai-battle-*-results-*.json` 파일 포맷에 `promptVersion` 필드 추가 또는 파일명 규약 문서화 — **Day 1~2**
4. **[Designer]** 섹션 6의 누락 포인트 8건 중 (1)(2)(3)(6)에 대한 결정 — **Day 1~2**
5. **[Frontend Dev]** Tailwind v4 환경에서 `--model-*` 변수 등록 spike (30분) — **Day 1**

### 8.3 범위 외 (명시적 제외 권고)

- 실시간 polling / WebSocket 업데이트 (수동 refresh 버튼만)
- CSV/PNG export
- i18n 영문 전환
- 프롬프트 diff viewer
- AICallLog 테이블 migration + insert 코드 (옵션 C)

---

## 9. 최종 권고

### 결론: **Conditional Ready**

UI 스택 호환성은 완전하며 와이어프레임의 컴포넌트 분할도 실무에 적합하다. recharts 기존 사용 경험이 있어 학습 곡선도 낮다. 그러나 **데이터 소스가 확정되지 않으면 Sprint 6 내 완료가 실질적으로 의미 없어지는** 구조적 리스크가 있다.

### 선결 항목 (5건)

1. 데이터 소스 옵션 확정 (A/B/C) — **PM**
2. `/admin/stats/ai/tournament` 엔드포인트 스키마 합의 — **Go Dev + Frontend Dev**
3. `promptVersion` 필드 포맷 결정 — **AI Engineer**
4. Designer 컴포넌트 스펙 30번의 모호 포인트 4건 정리 — **Designer**
5. Tailwind v4 커스텀 변수 spike — **Frontend Dev** (자체 완결, 30분)

### 선결 완료 시 Sprint 6 착수 가능 시점

Sprint 6 **Day 1 오후**부터 PR #1 작업 시작 → Day 5~6에 PR #5까지 완료 → Day 7 QA/버그 픽스 → Day 8~9 버퍼.

### Sprint 6 성공 판정 기준

- [ ] `/tournament` 페이지가 실데이터(최소 옵션 B 수준)로 로드
- [ ] 4개 주요 섹션(필터/PlaceRate/Cost/ModelCard/History) 모두 동작
- [ ] 모바일 뷰포트에서 1열 스택 정상
- [ ] WCAG AA 대비 수동 검증 통과
- [ ] E2E 최소 1건 (페이지 로드)
- [ ] 라운드 상세 페이지는 Phase 2로 이월 가능(MVP 필수 아님)

---

## 참조 파일 인덱스

- 와이어프레임: `docs/02-design/23-ai-tournament-dashboard-wireframe.md:1-894`
- LLM 메트릭 설계(미구현): `docs/02-design/13-llm-metrics-schema-design.md:1-541`
- admin 스택: `src/admin/package.json:1-29`
- 기존 recharts 사용례: `src/admin/src/components/StatsChart.tsx:1-60`
- 기존 사이드바: `src/admin/src/components/Sidebar.tsx:12-18`
- 기존 API 클라이언트: `src/admin/src/lib/api.ts:70-85,163-173`
- 기존 stats 페이지(참조 레이아웃): `src/admin/src/app/stats/page.tsx:1-131`
- AICallLog 모델: `src/game-server/internal/model/event.go:54-73`
- AutoMigrate 등록: `src/game-server/internal/infra/database.go:74`
- GetAIStats Stub: `src/game-server/internal/service/admin_service.go:183-196`
- 토너먼트 raw JSON 포맷: `scripts/ai-battle-3model-r4-results-deepseek-run1-20260411_134046.json:1-80`
