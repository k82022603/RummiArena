# 결정 로그 (Decision Record)

- **ID**: D-01
- **날짜**: 2026-03-08
- **상태**: 결정

## 제목
WSL2 메모리 할당량을 14GB → 10GB로 변경

## 배경 (Context)
- 장비: LG 그램 15Z90R, RAM 16GB
- 기존 `.wslconfig`에서 `memory=14GB`로 설정되어 있었음
- Windows 쪽 사용 가능 메모리가 1.75GB까지 하락
- 브라우저, VSCode 등 Windows 앱이 버벅이는 원인

## 선택지
| 옵션 | WSL2 | Windows 여유 | 비고 |
|------|------|-------------|------|
| A. 14GB (기존) | 14GB | ~2GB | Windows 쪽 메모리 부족 |
| B. 10GB | 10GB | ~6GB | 양쪽 균형 |
| C. 8GB | 8GB | ~8GB | WSL2 빡빡할 수 있음 |

## 결정
**옵션 B: 10GB**

## 근거
- 이 프로젝트 최대 동시 부하 분석:
  - Docker Desktop 엔진: ~1GB
  - K8s 시스템 (kubelet, CoreDNS): ~1GB
  - 앱 서비스 (게임서버, 프론트, Redis, PG): ~2GB
  - ArgoCD: ~1.5GB
  - SonarQube (가끔): ~2GB
  - **합계: ~7.5GB**
- 10GB면 WSL2에 2.5GB 여유 + Windows에 6GB 여유
- `autoMemoryReclaim=gradual` 추가로 미사용 메모리 자동 반환

## 변경 내용
```ini
# 변경 전
[wsl2]
memory=14GB
swap=1GB
processors=8

# 변경 후
[wsl2]
memory=10GB
swap=2GB
processors=8

[experimental]
autoMemoryReclaim=gradual
```

## 영향 범위
- 적용 후 `wsl --shutdown` 필요 (Docker Desktop 포함 재시작)
- Ollama 7B+ 모델 K8s 동시 실행 불가 (기존과 동일, AI 실험 모드에서 단독 실행)
- **크로스 프로젝트 영향**: `.wslconfig`는 WSL2 전역 설정이므로,
  `hybrid-rag-knowledge-ops` 프로젝트(14GB 필요)와 충돌 발생
- **해결**: 프로젝트별 `.wslconfig.profile` + `scripts/switch-wslconfig.sh` 스위칭 스크립트 도입
- hybrid-rag 복귀 시 `bash scripts/switch-wslconfig.sh hybrid-rag` 실행 필요
