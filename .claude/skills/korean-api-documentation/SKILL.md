---
name: korean-api-documentation
description: 한글 API 문서화 표준. 엔드포인트 템플릿 + OpenAPI 연동 + 에러 코드 표준. 신규 API 추가 시, game-server/ai-adapter API 확장 시 사용.
---

# Korean API Documentation

한글 API 문서화를 위한 표준과 템플릿을 정의합니다.

## Purpose

일관되고 명확한 한글 API 문서를 작성하여 개발자 경험(DX)을 향상시킵니다.

---

## Documentation Standards (문서화 표준)

### 필수 섹션

모든 API 문서에 포함해야 할 섹션:

1. **개요** - API의 목적과 사용 사례
2. **인증** - 인증 방식 및 토큰 획득 방법
3. **엔드포인트 목록** - 전체 API 목록과 설명
4. **상세 명세** - 각 엔드포인트별 상세
5. **에러 코드** - 에러 응답 정의
6. **예제** - 실제 사용 예시

---

## API Endpoint Template (엔드포인트 템플릿)

```markdown
## POST /api/v1/{resource}

{엔드포인트에 대한 한 줄 설명}

### 설명

{상세 설명. 언제 사용하는지, 주의사항 등}

### 인증

| 타입 | 필수 |
|------|------|
| Bearer Token | O |

### 요청

#### Headers

| 헤더 | 값 | 필수 | 설명 |
|------|-----|------|------|
| Authorization | Bearer {token} | O | 인증 토큰 |
| Content-Type | application/json | O | 요청 형식 |

#### Body Parameters

| 필드 | 타입 | 필수 | 설명 | 예시 |
|------|------|------|------|------|
| query | string | O | 검색 쿼리 | "프로젝트 일정" |
| topK | integer | X | 반환 개수 (기본: 10) | 5 |

#### 요청 예시

```json
{
  "query": "프로젝트 일정",
  "topK": 5
}
```

### 응답

#### 성공 (200 OK)

| 필드 | 타입 | 설명 |
|------|------|------|
| results | array | 검색 결과 목록 |
| results[].id | string | 문서 ID |
| results[].score | number | 관련도 점수 (0-1) |
| totalCount | integer | 전체 결과 수 |

#### 응답 예시

```json
{
  "results": [
    {
      "id": "doc-123",
      "title": "2026년 1분기 프로젝트 계획",
      "score": 0.95
    }
  ],
  "totalCount": 1
}
```

### 에러

| 코드 | 메시지 | 설명 |
|------|--------|------|
| 400 | INVALID_QUERY | 쿼리가 비어있음 |
| 401 | UNAUTHORIZED | 인증 실패 |
| 500 | INTERNAL_ERROR | 서버 오류 |

### cURL 예시

```bash
curl -X POST 'https://api.example.com/api/v1/search' \
  -H 'Authorization: Bearer {token}' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "프로젝트 일정",
    "topK": 5
  }'
```
```

---

## OpenAPI (Swagger) Standards

### 한글 설명 작성 규칙

```yaml
openapi: 3.0.0
info:
  title: 지식 검색 API
  description: |
    Hybrid RAG 기반 지식 검색 서비스 API입니다.

    ## 주요 기능
    - 자연어 검색
    - 키워드 검색
    - 지식 그래프 탐색

    ## 인증
    모든 API는 Bearer Token 인증이 필요합니다.
  version: 1.0.0

paths:
  /api/v1/search:
    post:
      summary: 지식 검색
      description: |
        Hybrid RAG 파이프라인을 통한 지식 검색을 수행합니다.

        검색 방식:
        - Vector Search: 의미적 유사도 기반
        - Graph Search: 지식 그래프 관계 기반
        - Keyword Search: 키워드 매칭 기반
      tags:
        - 검색
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SearchRequest'
            example:
              query: "프로젝트 일정"
              topK: 10
```

---

## Python Docstring Standards (Google Style)

```python
def search_knowledge(
    query: str,
    top_k: int = 10,
    filters: Optional[Dict[str, Any]] = None
) -> SearchResult:
    """지식 베이스에서 관련 문서를 검색합니다.

    Hybrid RAG 파이프라인을 사용하여 Vector, Graph, Keyword
    세 가지 검색 방식을 결합한 결과를 반환합니다.

    Args:
        query: 검색 쿼리 문자열. 자연어 질문 형태 권장.
        top_k: 반환할 최대 결과 수. 기본값: 10, 최대: 100.
        filters: 필터 조건 딕셔너리 (선택).
            - document_type (str): 문서 타입 필터 ("pdf", "docx" 등)
            - date_range (dict): 날짜 범위 필터
                - start (str): 시작일 (ISO 8601)
                - end (str): 종료일 (ISO 8601)
            - tags (list): 태그 필터

    Returns:
        SearchResult: 검색 결과 객체
            - documents (List[Document]): 검색된 문서 목록
            - scores (List[float]): 관련도 점수 목록 (0-1)
            - metadata (SearchMetadata): 검색 메타데이터
                - total_count (int): 전체 결과 수
                - search_time_ms (int): 검색 소요 시간

    Raises:
        ValueError: 쿼리가 비어있거나 top_k가 범위를 벗어난 경우
        SearchError: 검색 엔진 오류 발생 시
        AuthenticationError: 인증 토큰이 유효하지 않은 경우

    Example:
        기본 검색::

            >>> result = search_knowledge("프로젝트 일정")
            >>> print(f"검색 결과: {len(result.documents)}건")
            검색 결과: 10건

        필터 적용 검색::

            >>> filters = {
            ...     "document_type": "pdf",
            ...     "date_range": {"start": "2026-01-01"}
            ... }
            >>> result = search_knowledge("예산", filters=filters)

    Note:
        - 검색 쿼리는 한글 또는 영문 모두 지원합니다.
        - 너무 짧은 쿼리(2자 미만)는 정확도가 떨어질 수 있습니다.
        - 대용량 검색 시 top_k를 적절히 조절하세요.

    See Also:
        - `stream_search`: 스트리밍 검색
        - `keyword_search`: 키워드 전용 검색
    """
```

---

## Error Code Documentation

### 에러 코드 표준 형식

```markdown
## 에러 코드

### 공통 에러

| HTTP 코드 | 에러 코드 | 메시지 | 설명 | 해결 방법 |
|-----------|----------|--------|------|----------|
| 400 | INVALID_REQUEST | 잘못된 요청입니다 | 요청 형식 오류 | 요청 본문 확인 |
| 401 | UNAUTHORIZED | 인증이 필요합니다 | 토큰 없음/만료 | 토큰 재발급 |
| 403 | FORBIDDEN | 권한이 없습니다 | 접근 권한 부족 | 권한 확인 |
| 404 | NOT_FOUND | 리소스를 찾을 수 없습니다 | 존재하지 않는 리소스 | ID 확인 |
| 429 | RATE_LIMITED | 요청이 너무 많습니다 | Rate limit 초과 | 잠시 후 재시도 |
| 500 | INTERNAL_ERROR | 서버 오류가 발생했습니다 | 내부 오류 | 관리자 문의 |

### 도메인별 에러

#### 검색 API

| 에러 코드 | 메시지 | 설명 |
|----------|--------|------|
| EMPTY_QUERY | 검색어를 입력하세요 | 쿼리가 비어있음 |
| QUERY_TOO_LONG | 검색어가 너무 깁니다 | 500자 초과 |
| INVALID_FILTER | 유효하지 않은 필터입니다 | 필터 형식 오류 |
```

---

## Terminology Standards (용어 표준)

### 기술 용어 한글화 가이드

| 영문 | 한글 | 사용 예시 |
|------|------|----------|
| Request | 요청 | "요청 본문" |
| Response | 응답 | "응답 데이터" |
| Endpoint | 엔드포인트 | "검색 엔드포인트" |
| Parameter | 파라미터 / 매개변수 | "쿼리 파라미터" |
| Authentication | 인증 | "Bearer 인증" |
| Authorization | 권한 | "권한 검사" |
| Token | 토큰 | "액세스 토큰" |
| Pagination | 페이지네이션 | "커서 기반 페이지네이션" |
| Rate Limit | Rate Limit | "Rate Limit 초과" |

### 한글 작성 시 주의사항

1. **외래어는 원어 그대로** - API, JSON, HTTP 등
2. **동사형 종결** - "~합니다", "~됩니다"
3. **존댓말 사용** - 문서 전체 일관성
4. **예시 필수** - 모든 설명에 예시 포함

---

## Quality Checklist (품질 체크리스트)

API 문서 작성 후 확인:

- [ ] 모든 엔드포인트에 설명이 있는가?
- [ ] 모든 파라미터에 타입, 필수 여부, 설명이 있는가?
- [ ] 요청/응답 예시가 포함되어 있는가?
- [ ] 에러 코드와 해결 방법이 명시되어 있는가?
- [ ] cURL 예시가 복사해서 바로 실행 가능한가?
- [ ] 한글 맞춤법과 용어가 일관적인가?

---

**Version**: 1.0.0
**Last Updated**: 2026-01-24
