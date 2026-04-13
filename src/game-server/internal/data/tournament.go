// Package data 정적 JSON 데이터 번들.
//
// Sprint 6 W1 선행 구현 (옵션 B — 정적 JSON 프록시).
// TournamentSummary는 실제 Round 4/5 대전 결과를 임베드한 JSON을 바이트 그대로
// 노출한다. Sprint 6 W2에서는 이 패키지를 service.TournamentService로 교체하고,
// admin_handler.GetTournamentSummary가 DB 집계 결과를 반환하도록 수정한다.
//
// 임시 구현 배경:
//   - DB 집계(Round 4/5 메트릭 수집·계산) 구현 전에 Frontend Dev가
//     대시보드 UI 작업을 시작할 수 있도록 엔드포인트를 선행 제공.
//   - JSON 스키마는 docs/02-design/33-ai-tournament-dashboard-component-spec.md
//     §6.2 응답 예시를 그대로 따른다.
package data

import _ "embed"

// TournamentSummaryJSON 정적 토너먼트 요약 JSON.
//
// 참조: docs/04-testing/37-3model-round4-tournament-report.md
//       docs/04-testing/46-multirun-3model-report.md
//
// Sprint 6 W2 교체 주의사항:
//   - 이 파일을 삭제하지 말 것. service 계층이 나오면 이 파일은 fallback
//     (DB 실패 시 정적 응답)으로 재활용한다.
//   - 라운드 ID 포맷(R2/R3/R4/R5-{MODEL}-run{N})은 설계 33번 §10 오픈이슈 #6
//     참고. Sprint 6 W2 DB 스키마에서 tournament_rounds.round_id 컬럼을 동일
//     포맷으로 저장한다.
//
//go:embed tournament-summary.json
var TournamentSummaryJSON []byte
