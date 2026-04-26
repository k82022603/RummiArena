---
name: layered-architecture-enforcer
description: 계층형 아키텍처 가드레일. L1(UI)→L2(상태)→L3(도메인)→L4(통신) 단방향 의존성 강제. 안티패턴 5종 차단 + Dev 에이전트 코드 생성 시 사전 검증.
---

# Layered Architecture Enforcer

> "AI는 당신의 아키텍처를 깨뜨리지 않는다. 조용히 구부려서 형태를 잃게 만든다."

## Purpose

계층형 아키텍처 원칙을 강제하여 AI가 생성하는 코드에서 안티패턴을 방지합니다.

**참고 문서**: [AI 시대에 더욱 중요해진 아키텍처 원칙](../../docs/technical_assessment/SubAgent%20%26%20AgentSkills/)

---

## Anti-Pattern Detection (안티패턴 탐지)

코드 생성 전 반드시 확인:

### 🚫 절대 금지 패턴

| 패턴 | 문제점 | 탐지 방법 |
|------|--------|----------|
| **Controller → Repository 직접 호출** | 계층 분리 붕괴, 비즈니스 로직 분산 | Controller에서 Repository import 확인 |
| **Service에 RequestDTO 전달** | 도메인 독립성 깨짐, 재사용 불가 | Service 메서드 파라미터에 DTO 클래스 확인 |
| **Controller에 비즈니스 로직** | 재사용 불가, 테스트 어려움 | Controller에 if/switch 비즈니스 분기 확인 |
| **Repository에 비즈니스 로직** | 데이터 접근 계층 오염 | Repository에 비즈니스 규칙 확인 |

---

## Layer Definitions (계층 정의)

### Controller Layer (Presentation)

**책임:**
- HTTP 요청/응답 처리
- 입력 검증 (형식만, 비즈니스 규칙 X)
- DTO ↔ Domain 변환
- Service 계층에 위임

**금지:**
```
❌ NEVER directly use Repository
❌ NEVER contain business logic
❌ NEVER pass Request DTOs to Service
❌ NEVER know about database
```

**올바른 패턴:**
```java
@PostMapping
public ResponseEntity<UserResponse> createUser(@Valid @RequestBody CreateUserRequest request) {
    // ✅ DTO → Domain 파라미터 변환
    User user = userService.createUser(
        request.getName(),
        request.getEmail(),
        request.getRole()
    );
    // ✅ Domain → DTO 변환
    return ResponseEntity.ok(UserResponse.from(user));
}
```

### Service Layer (Business Logic)

**책임:**
- 비즈니스 규칙 구현
- 트랜잭션 관리
- Repository 간 조율
- Domain 객체 반환

**금지:**
```
❌ NEVER use Request/Response DTOs
❌ NEVER know about HTTP (status codes, headers)
❌ NEVER import web layer packages
```

**올바른 패턴:**
```java
@Service
@Transactional
public class UserService {
    // ✅ Domain 파라미터만 받음
    public User createUser(String name, String email, UserRole role) {
        // 비즈니스 규칙 검증
        if (userRepository.existsByEmail(email)) {
            throw new DuplicateEmailException(email);
        }

        User user = User.create(name, email, role);
        return userRepository.save(user);
    }
}
```

### Repository Layer (Data Access)

**책임:**
- 데이터베이스 작업만
- Domain Entity 반환
- 쿼리 최적화

**금지:**
```
❌ NEVER contain business logic
❌ NEVER know about web layer
❌ NEVER validate business rules
```

---

## Code Generation Rules (코드 생성 규칙)

새 엔드포인트 생성 시 순서:

1. **RequestDTO 생성** (`web.dto` 패키지)
2. **ResponseDTO 생성** (`web.dto` 패키지)
3. **Domain Entity 생성/확인** (`domain` 패키지)
4. **Service 메서드 생성** (Domain 파라미터만)
5. **Repository 인터페이스 생성**
6. **Controller 생성** (DTO 변환 포함)

---

## Validation Checklist (검증 체크리스트)

코드 생성 후 확인:

- [ ] Controller에서 Repository를 import하지 않았는가?
- [ ] Service 메서드가 RequestDTO를 파라미터로 받지 않는가?
- [ ] Service가 HTTP 관련 코드(ResponseEntity, HttpStatus)를 사용하지 않는가?
- [ ] 비즈니스 로직이 Service 계층에만 있는가?
- [ ] 각 계층이 아래 계층에만 의존하는가?
- [ ] 순환 의존성이 없는가?

---

## Language-Specific Patterns

### Java/Spring Boot

```java
// ✅ 올바른 의존성 방향
@Controller → @Service → @Repository

// ❌ 잘못된 의존성
@Controller → @Repository  // 금지!
@Service(RequestDTO dto)   // 금지!
```

### Python/FastAPI

```python
# ✅ 올바른 의존성 방향
router → service → repository

# ❌ 잘못된 의존성
router → repository  # 금지!
def service_method(request: RequestModel)  # 금지!
```

### TypeScript/NestJS

```typescript
// ✅ 올바른 의존성 방향
@Controller → @Injectable Service → @Injectable Repository

// ❌ 잘못된 의존성
@Controller 내에서 Repository 직접 사용  // 금지!
serviceMethod(dto: CreateUserDto)  // 금지!
```

---

## Error Handling by Layer

| 계층 | 에러 처리 방식 |
|------|---------------|
| **Controller** | HTTP 상태 코드 매핑, 에러 응답 DTO 변환 |
| **Service** | 비즈니스 예외 발생, 트랜잭션 롤백 |
| **Repository** | 데이터 접근 예외, 재시도 로직 |

---

## When to Reject Code (코드 거부 조건)

다음 패턴 발견 시 즉시 거부하고 수정 요청:

1. `@Controller` 클래스에서 `Repository` import
2. `@Service` 메서드 파라미터에 `*Request`, `*Dto` 타입
3. `@Service` 클래스에서 `ResponseEntity`, `HttpStatus` 사용
4. `@Repository`에서 비즈니스 조건 분기 (if/switch)
5. 단일 파일에 Controller + Service + Repository 모두 존재

---

**Version**: 1.0.0
**Last Updated**: 2026-01-24
