# WSL2 + .wslconfig 매뉴얼

## 1. 개요

WSL2(Windows Subsystem for Linux 2)는 Hyper-V 기반 경량 VM으로 Linux를 실행한다.
Docker Desktop도 WSL2 위에서 동작하므로, WSL2의 리소스 설정이 전체 개발 환경의 성능을 좌우한다.

`.wslconfig`는 WSL2 VM의 리소스 상한을 제어하는 설정 파일이다.

## 2. 파일 위치

```
C:\Users\{사용자명}\.wslconfig
```

이 프로젝트 기준: `C:\Users\KTDS\.wslconfig`

> WSL 내부가 아닌 **Windows 쪽**에 위치한다.

## 3. 프로젝트별 프로파일 관리

`.wslconfig`는 WSL2 전역 설정이므로, 프로젝트마다 요구 리소스가 다를 때 충돌한다.
각 프로젝트 루트에 `.wslconfig.profile`을 두고 스위칭 스크립트로 전환한다.

### 프로파일 비교

| 프로젝트 | memory | swap | processors | autoMemoryReclaim | 이유 |
|----------|--------|------|------------|-------------------|------|
| **RummiArena** (이 프로젝트) | 10GB | 4GB | 6 | dropcache | K8s + 앱 서비스 (~7.5GB) |
| **hybrid-rag-knowledge-ops** | 14GB | 4GB | 8 | dropcache | ES + AI 임베딩 (18개 컨테이너, ~11GB) |

### 이 프로젝트 프로파일 (`RummiArena/.wslconfig.profile`)

```ini
[wsl2]
memory=10GB      # K8s + 앱 서비스: ~7.5GB, SonarQube 추가 시 ~9GB
swap=4GB         # OOM 방지 안전 마진
processors=6

[experimental]
autoMemoryReclaim=dropcache   # 캐시 적극 회수
sparseVhd=true                # 가상 디스크 자동 축소
```

### 프로파일 전환 방법

```bash
# RummiArena 모드로 전환 (이 프로젝트)
bash scripts/switch-wslconfig.sh rummiarena   # (약칭: ra)

# hybrid-rag 모드로 전환
bash scripts/switch-wslconfig.sh hybrid-rag   # (약칭: hr)

# 현재 상태 확인
bash scripts/switch-wslconfig.sh status       # (약칭: st)
```

전환 후 반드시 PowerShell에서 `wsl --shutdown` 실행 필요.

### 미전환 시 영향

- **hybrid-rag 설정(14GB)으로 이 프로젝트 작업 시**: Windows 쪽 메모리 부족 → 브라우저/VSCode 멈춤
- **이 프로젝트 설정(10GB)으로 hybrid-rag 작업 시**: api-gateway OOM Kill (Exit 137), 컨테이너 연쇄 종료

### 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-03-09 | swap 2→4GB, processors 8→6, sparseVhd=true 추가 | 현재 안정 .wslconfig와 프로파일 동기화 |
| 2026-03-08 #1 | memory 14→10GB, swap 1→2GB, autoMemoryReclaim=gradual 추가 | Windows 가용 메모리 1.75GB까지 하락 |
| 2026-03-08 #2 | swap 2→4GB, processors 8→4, autoMemoryReclaim gradual→dropcache, sparseVhd=true 추가 | docker MCP fork 버그로 WSL OOM 발생, 안전 마진 확보 |
| 2026-03-08 #3 | memory 8→10GB, processors 4→6 | docker MCP 삭제 후 메모리 안정화, 성능 재상향 |

> 결정 상세: [work_logs/decisions/D01-wslconfig-memory.md](../../work_logs/decisions/D01-wslconfig-memory.md)

## 4. 설정 항목 설명

```ini
[wsl2]
memory=10GB         # WSL2 최대 메모리 (기본값: 호스트 RAM의 80%)
swap=4GB            # 스왑 파일 크기 (기본값: 호스트 RAM의 25%)
processors=6        # WSL2 CPU 코어 수 (기본값: 전체)
localhostForwarding=true  # localhost 포트포워딩 (기본값: true)
```

### 설정 가능한 전체 옵션

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `memory` | 호스트의 80% | WSL2 VM 최대 메모리 |
| `swap` | 호스트의 25% | 스왑 파일 크기 (0이면 스왑 없음) |
| `processors` | 전체 | WSL2에 할당할 논리 프로세서 수 |
| `localhostForwarding` | true | WSL2 포트를 localhost로 포워딩 |
| `kernelCommandLine` | 없음 | 추가 커널 부트 파라미터 |
| `safeMode` | false | 안전 모드 (문제 해결 시) |
| `autoMemoryReclaim` | disabled | 메모리 자동 회수 모드 |

### autoMemoryReclaim (Windows 11 22H2+)

```ini
[experimental]
autoMemoryReclaim=gradual    # WSL2가 안 쓰는 메모리를 점진적 반환
```

| 값 | 동작 |
|----|------|
| `disabled` | 메모리 회수 안 함 (기본) |
| `dropcache` | 캐시 메모리만 회수 |
| `gradual` | 점진적 회수 (권장) |

## 5. 권장 설정 시나리오

### 시나리오 A: 개발 중심 (K8s + 앱 서비스)
```ini
[wsl2]
memory=8GB
swap=4GB
processors=4

[experimental]
autoMemoryReclaim=dropcache
sparseVhd=true
```

**효과**: Windows 쪽 ~6GB 여유. 브라우저, VSCode 쾌적.
**제한**: K8s + 전체 서비스 동시 실행 시 빡빡할 수 있음.

### 시나리오 B: 최대 성능 (AI 실험, 빌드)
```ini
[wsl2]
memory=12GB
swap=4GB
processors=8

[experimental]
autoMemoryReclaim=dropcache
sparseVhd=true
```

**효과**: WSL2 성능 극대화.
**제한**: Windows 쪽 ~2~3GB. 브라우저 최소한으로.

### 시나리오 C: 균형 (현재 장비 권장) ← 현재 적용 중
```ini
[wsl2]
memory=10GB
swap=4GB
processors=6

[experimental]
autoMemoryReclaim=dropcache
sparseVhd=true
```

**효과**: WSL2 10GB + Windows 4~5GB. 양쪽 적당히 사용 가능.

## 6. 적용 방법

`.wslconfig` 수정 후 반드시 WSL 재시작 필요:

```powershell
# PowerShell (관리자)
wsl --shutdown

# 재시작 확인
wsl -l -v
```

> Docker Desktop도 함께 재시작된다. 실행 중인 컨테이너는 중지됨.

## 7. 상태 확인 명령어

### Windows 쪽 (PowerShell)
```powershell
# 전체 메모리 확인
Get-CimInstance Win32_OperatingSystem | Select TotalVisibleMemorySize,FreePhysicalMemory

# WSL2 VM 프로세스 메모리 확인
Get-Process vmmem -ErrorAction SilentlyContinue | Select WorkingSet64
```

### WSL2 내부
```bash
# 현재 메모리 상태
free -h

# 메모리 많이 쓰는 프로세스
ps aux --sort=-%mem | head -10

# Docker 컨테이너 메모리
docker stats --no-stream
```

## 8. 트러블슈팅

| 문제 | 원인 | 해결 |
|------|------|------|
| Windows 사용 가능 메모리 부족 | WSL2 memory 너무 높음 | `.wslconfig` memory 줄이기 |
| WSL2 OOM (Out of Memory) | memory 너무 낮음 | memory 올리기, swap 늘리기 |
| WSL2 OOM (프로세스 fork 폭주) | MCP 서버 등 프로세스 버그 | `ps aux --sort=-%mem`으로 원인 프로세스 특정 후 제거 |
| Docker 컨테이너 시작 실패 | WSL2 메모리 부족 | 불필요 컨테이너 정리 |
| .wslconfig 적용 안 됨 | `wsl --shutdown` 안 함 | 반드시 재시작 |
| vmmem 프로세스 메모리 폭주 | autoMemoryReclaim 미설정 | `dropcache` 또는 `gradual` 설정 |

## 9. 이 프로젝트에서의 의미

Docker Desktop + K8s + 개발 서비스 모두 WSL2 안에서 동작하므로,
`.wslconfig`의 `memory` 값이 **프로젝트 전체의 리소스 천장**을 결정한다.

| .wslconfig memory | K8s 동시 실행 가능 서비스 |
|-------------------|--------------------------|
| 6GB | 앱 2~3개 + Redis |
| 8GB | 앱 + Redis + PG + ArgoCD |
| 10GB | 위 + SonarQube (빡빡) |
| 12GB | 위 + Ollama 1B 모델 (한계) |

## 10. 참고 링크

- 공식 문서: https://learn.microsoft.com/ko-kr/windows/wsl/wsl-config
- 메모리 관리: https://learn.microsoft.com/ko-kr/windows/wsl/disk-space
