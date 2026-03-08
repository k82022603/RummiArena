# Ollama 매뉴얼

## 1. 개요
로컬 LLM 서빙 도구. OpenAI 호환 REST API로 LLM 호출 가능.
비용 0원으로 AI 플레이어 실험, 토너먼트, 프롬프트 최적화에 활용.

## 2. 설치

### 2.1 Windows 직접 설치
https://ollama.com/download 에서 다운로드 후 설치.
```bash
ollama --version
```

### 2.2 WSL2에서 설치
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2.3 Docker로 실행
```bash
docker run -d -p 11434:11434 --name ollama \
  -v ollama_data:/root/.ollama \
  ollama/ollama
```

### 2.4 K8s Pod로 배포
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ollama
  namespace: rummikub
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ollama
  template:
    metadata:
      labels:
        app: ollama
    spec:
      containers:
        - name: ollama
          image: ollama/ollama:latest
          ports:
            - containerPort: 11434
          resources:
            limits:
              memory: 8Gi
              cpu: "4"
          volumeMounts:
            - name: ollama-data
              mountPath: /root/.ollama
      volumes:
        - name: ollama-data
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: ollama
  namespace: rummikub
spec:
  selector:
    app: ollama
  ports:
    - port: 11434
      targetPort: 11434
```

### 2.5 Oracle VM에 설치 (리소스 분리, 권장)
- Ubuntu VM, 8GB+ RAM, 4 CPU
- Docker 설치 → Ollama 컨테이너 실행
- VM IP로 K8s에서 ExternalName Service 연결

## 3. 모델 설치

### 3.1 권장 모델 (이 프로젝트 기준)

| 모델 | 크기 | RAM 필요 | 용도 | 응답 속도 |
|------|------|----------|------|-----------|
| `llama3.2:1b` | 1.3GB | 4GB | 하수 AI, 빠른 테스트 | 빠름 |
| `llama3.2:3b` | 2.0GB | 6GB | 하수~중수 AI | 보통 |
| `llama3.2` (8b) | 4.7GB | 8GB | 중수 AI | 느림 |
| `qwen2.5:7b` | 4.4GB | 8GB | 중수 AI (대안) | 느림 |
| `gemma2:2b` | 1.6GB | 4GB | 하수 AI (대안) | 빠름 |
| `deepseek-r1:7b` | 4.7GB | 8GB | 추론 특화 AI | 느림 |

### 3.2 모델 다운로드
```bash
ollama pull llama3.2:3b
ollama pull llama3.2:1b
```

### 3.3 모델 목록 확인
```bash
ollama list
```

## 4. API 사용법

### 4.1 Chat API (OpenAI 호환)
```bash
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:3b",
    "messages": [
      {"role": "system", "content": "당신은 루미큐브 AI 플레이어입니다."},
      {"role": "user", "content": "현재 테이블: [R3,B3,K3]\n내 타일: [R5,Y3,B7]\n최적의 수를 JSON으로 응답하세요."}
    ],
    "temperature": 0.3,
    "response_format": {"type": "json_object"}
  }'
```

### 4.2 Generate API (Ollama 네이티브)
```bash
curl http://localhost:11434/api/generate \
  -d '{
    "model": "llama3.2:3b",
    "prompt": "...",
    "stream": false
  }'
```

### 4.3 K8s 내부에서 호출
```
http://ollama.rummikub.svc.cluster.local:11434
```

## 5. 프로젝트 활용 시나리오

### 5.1 AI 하수 캐릭터 (Rookie)
- 모델: `llama3.2:1b` or `gemma2:2b`
- 작고 빠름, 실수도 자연스러움
- 비용: 0원

### 5.2 AI vs AI 토너먼트
- API 모델 vs 로컬 모델 대량 대전
- API 비용 절약하면서 수백 게임 실행
- 승률 통계 수집

### 5.3 프롬프트 최적화
- 로컬에서 반복 실험 → 완성된 프롬프트를 API 모델에 적용
- 응답 형식 검증, JSON 파싱 테스트

### 5.4 오프라인 개발
- 인터넷 없이도 AI 대전 테스트 가능

## 6. 성능 튜닝

### 6.1 환경 변수
```bash
# 동시 요청 수 제한
OLLAMA_NUM_PARALLEL=2

# 컨텍스트 크기 (토큰)
OLLAMA_MAX_LOADED_MODELS=2
```

### 6.2 GPU 가속 (NVIDIA GPU 있는 경우)
```bash
docker run -d --gpus all -p 11434:11434 ollama/ollama
```

## 7. 트러블슈팅

| 문제 | 해결 |
|------|------|
| 응답 느림 (30초+) | 더 작은 모델 사용 (`1b`, `3b`) |
| OOM (메모리 부족) | `resources.limits.memory` 증가 또는 VM 분리 |
| JSON 응답 깨짐 | `response_format: json_object` + 프롬프트에 형식 명시 |
| 모델 로딩 오래 걸림 | 첫 호출만 느림 (모델 메모리 로드), 이후 캐시 |

## 8. 참고 링크
- 공식: https://ollama.com
- 모델 라이브러리: https://ollama.com/library
- API 문서: https://github.com/ollama/ollama/blob/main/docs/api.md
