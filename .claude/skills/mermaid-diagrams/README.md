# Mermaid 다이어그램 표준

> 문서 내 다이어그램을 일관된 형식으로 작성하여 가독성과 유지보수성을 높입니다.

## 언제 사용하나

- 문서에 다이어그램(흐름도, 시퀀스, 상태, ER, 간트 등)을 추가할 때
- 기존 ASCII art 다이어그램을 Mermaid로 전환할 때
- GitHub에서 렌더링되는 다이어그램을 작성할 때

## 핵심 흐름

1. 상황에 맞는 Mermaid 유형 선택 (flowchart/sequenceDiagram/stateDiagram 등)
2. GitHub 렌더링 주의사항 준수 (gantt 작업명 콜론 금지, edge label 줄바꿈 금지 등)
3. 모든 노드에 한글 설명 포함
4. 노드 20개 이상이면 다이어그램 분리

## 관련 문서

- `CLAUDE.md` -- Diagram Convention 섹션
- 프로젝트 전체 문서(`docs/`)에서 Mermaid 사용

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-01-24 | v1.0 | 최초 작성 (유형 선택, GitHub 주의사항, 스타일 가이드) |
