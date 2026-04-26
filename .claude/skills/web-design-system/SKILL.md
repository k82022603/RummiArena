---
name: web-design-system
description: 웹 디자인 시스템 가이드. Verbalized Sampling 기법 + TailwindCSS 색상/타이포/레이아웃 표준 + 컴포���트 안티패턴 식별. UI 신설/리디자인 시 designer/frontend-dev 필수 참조.
---

# Web Design System Skill

> **Version**: 2.0
> **Last Updated**: 2026-01-15
> **Author**: Claude Code

## Overview
웹 기획자와 디자이너를 위한 comprehensive guide입니다. UX/UI 디자인, 와이어프레임, 프로토타입, 디자인 시스템 구축을 지원하며, **Verbalized Sampling 기법**으로 뻔한 디자인을 피하고 독창적인 결과물을 만듭니다.

### 핵심 가치
- **Anti-Pattern First**: 뻔한 것을 먼저 식별하고 피하기
- **한글 최적화**: 한국어 타이포그래피에 최적화된 디자인
- **접근성 준수**: WCAG 2.1 AA 기준 충족
- **성능 중심**: Core Web Vitals 최적화

## When to Use This Skill
다음과 같은 작업을 할 때 이 skill을 사용합니다:
- 웹사이트/앱 와이어프레임 설계
- UI/UX 프로토타입 제작
- 디자인 시스템 구축
- 사용자 플로우 다이어그램
- 정보 구조도 (IA) 설계
- 랜딩 페이지 디자인
- 반응형 웹 디자인
- 접근성 최적화

## When NOT to Use This Skill
다음 경우에는 이 skill을 사용하지 마세요:
- **단순 텍스트 편집**: 기존 콘텐츠의 문구 수정만 필요한 경우
- **코드 리뷰**: 순수 코드 로직 리뷰 (디자인 관련 아닌 경우)
- **백엔드 API 개발**: 서버 로직, 데이터베이스 설계
- **기존 디자인 시스템 적용**: 이미 정의된 디자인 시스템을 그대로 사용하는 경우
- **빠른 프로토타입**: 창의성보다 속도가 중요한 MVP 단계

## 🚫 Anti-Pattern First: Verbalized Sampling

### 핵심 원칙
**뻔한 디자인을 먼저 식별하고 피하기**

디자인 생성 전, AI에게 먼저 "가장 흔한 선택"을 말하게 한 후 그것을 금지시킵니다. 그 다음 창의적인 대안을 생성하면서도 기본적인 디자인 품질 가드레일은 통과하도록 합니다.

### 뻔한 디자인 패턴 라이브러리 (피해야 할 것)

#### 🎨 색상
```
❌ 절대 사용하지 말 것:
- 보라색 그라데이션 (#667eea → #764ba2)
- 파란색 → 보라색 그라데이션 (#4facfe → #00f2fe)
- SaaS 스타트업 파란색 (#3b82f6)
- 다크 모드 네온 (#00ffff, #ff00ff)
- 민트/핑크 조합 (#4ade80 + #f472b6)

✅ 대신 시도할 것:
- 예상치 못한 색상 조합
- 자연에서 영감받은 팔레트
- 전통 색채 현대화
- 단색 + 강렬한 액센트
- 저채도 세련된 조합
```

#### 🧩 레이아웃
```
❌ 피해야 할 레이아웃:
- 중앙 정렬 히어로 섹션 + CTA 버튼
- 3개 박스 Feature 섹션
- 지그재그 교차 섹션
- 카드 그리드 (동일한 크기)
- 전통적인 F-패턴

✅ 시도할 것:
- 비대칭 레이아웃
- 브로큰 그리드 시스템
- 겹치는 요소들
- 예상치 못한 스크롤 방향
- 공백의 대담한 활용
```

#### 🔤 타이포그래피
```
❌ 뻔한 선택:
- Inter + Inter (헤딩 + 본문 모두 Inter)
- Montserrat Bold 제목
- Poppins everywhere
- 전체 대문자 제목 (ALL CAPS)
- 48px 획일적 제목 크기

✅ 창의적 대안:
- 세리프 + 산세리프 믹스
- 극단적 크기 대비 (120px vs 14px)
- 가변 폰트 활용
- 로컬라이즈된 폰트 (한글: Pretendard Variable)
- 타이포그래피가 주인공인 디자인
```

#### 🧱 컴포넌트
```
❌ 절대 금지:
- shadcn/ui 기본 스타일 그대로
- Material-UI 기본 테마
- Bootstrap 느낌나는 버튼
- 둥근 모서리 8px 카드
- 드롭 그림자 (0 2px 4px rgba(0,0,0,0.1))

✅ 독창적 대안:
- 커스텀 디자인 시스템
- 브랜드 고유의 비주얼 언어
- 예상치 못한 인터랙션
- 마이크로 인터랙션 강화
- 물리 법칙을 따르는 애니메이션
```

### Verbalized Sampling Workflow

#### Step 1: Cliché Identification (뻔한 것 식별)
```
프롬프트 템플릿:
"[웹사이트 유형]의 가장 흔한 디자인 패턴 5가지를 리스트해줘.
색상, 레이아웃, 타이포그래피, 컴포넌트 별로."

예시 응답:
1. 색상: 파란색 그라데이션
2. 레이아웃: 중앙 정렬 히어로
3. 타이포그래피: Inter Bold 48px
4. 컴포넌트: shadcn/ui 카드
5. CTA: 둥근 버튼 + 그림자
```

#### Step 2: Constraint Application (제약 적용)
```
"위에서 말한 5가지를 완전히 피하면서,
[웹사이트 목적]에 맞는 창의적인 디자인 3가지를 제안해줘.
각각 왜 독창적인지, 어떤 사용자 경험을 제공하는지 설명해줘."
```

#### Step 3: Divergent Exploration (발산적 탐색)
```
"3가지 중 가장 창의적이면서도 실용적인 것을 선택하고,
다음을 생성해줘:
1. 상세 디자인 시스템
2. 컴포넌트 명세
3. 반응형 레이아웃
4. 인터랙션 가이드"
```

#### Step 4: Quality Guardrails (품질 가드레일)
```
창의성 체크리스트:
✅ 웹 접근성 WCAG 2.1 AA 준수
✅ 색상 대비비 4.5:1 이상
✅ 모바일 터치 타겟 44x44px 이상
✅ 로딩 시간 고려한 디자인
✅ 다국어 지원 (한글 최적화)

독창성 체크리스트:
✅ 경쟁사와 차별화되는 비주얼
✅ 예상을 깨는 요소 1개 이상
✅ 브랜드 고유의 비주얼 언어
✅ 기억에 남는 인터랙션
```

## 디자인 시스템 구축

### 1. 색상 시스템

#### 창의적 색상 팔레트 생성
```javascript
// ❌ 뻔한 방식
const boringPalette = {
  primary: '#3b82f6',    // 흔한 파란색
  secondary: '#8b5cf6',  // 보라색
  accent: '#ec4899'      // 핑크
}

// ✅ 독창적 방식
const creativePalette = {
  // 예시 1: 딥 포레스트
  forest: {
    primary: '#0D3B2E',     // 깊은 숲
    secondary: '#1A5F4A',   // 모스 그린
    accent: '#E8B54D',      // 황금빛
    neutral: '#F4F1E8',     // 크림 화이트
    text: '#1F2421'
  },
  
  // 예시 2: 테라코타 선셋
  terracotta: {
    primary: '#C85C3C',     // 테라코타
    secondary: '#8B4F39',   // 번트 시에나
    accent: '#F4E3D3',      // 따뜻한 베이지
    neutral: '#FBF8F3',     // 오프화이트
    text: '#2C1810'
  },
  
  // 예시 3: 미드나잇 애쉬
  midnight: {
    primary: '#2C3539',     // 차콜
    secondary: '#4A5568',   // 슬레이트
    accent: '#C4C4C4',      // 애쉬 그레이
    neutral: '#F7F7F7',     // 연한 회색
    text: '#1A1D1F'
  }
}

// 60-30-10 Rule 적용
const colorDistribution = {
  dominant: 'primary',      // 60%
  secondary: 'secondary',   // 30%
  accent: 'accent'          // 10%
}
```

#### 색상 접근성 검증
```javascript
function checkContrast(foreground, background) {
  // WCAG 2.1 AA 기준: 4.5:1
  // WCAG 2.1 AAA 기준: 7:1
  
  const contrast = calculateContrastRatio(foreground, background)
  
  return {
    AA: contrast >= 4.5,
    AAA: contrast >= 7,
    ratio: contrast
  }
}

// 사용 예시
const textOnBackground = checkContrast('#0D3B2E', '#F4F1E8')
// { AA: true, AAA: true, ratio: 12.3 }
```

### 2. 타이포그래피 시스템

#### 한글 웹사이트 최적화
```css
/* ❌ 뻔한 선택 */
body {
  font-family: 'Inter', sans-serif;
  /* Inter는 한글 지원 부족 */
}

/* ✅ 한글 최적화 */
:root {
  /* Primary: 가변 폰트 사용 */
  --font-primary: 'Pretendard Variable', 
                  'Pretendard', 
                  -apple-system, 
                  BlinkMacSystemFont, 
                  system-ui, 
                  sans-serif;
  
  /* Serif: 제목용 */
  --font-display: 'Gowun Batang', 
                  'Noto Serif KR', 
                  Georgia, 
                  serif;
  
  /* Mono: 코드용 */
  --font-mono: 'D2Coding', 
               'Consolas', 
               monospace;
}

/* Type Scale (Major Third - 1.25) */
--text-xs: 0.64rem;    /* 10.24px */
--text-sm: 0.8rem;     /* 12.8px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.25rem;    /* 20px */
--text-xl: 1.563rem;   /* 25px */
--text-2xl: 1.953rem;  /* 31.25px */
--text-3xl: 2.441rem;  /* 39px */
--text-4xl: 3.052rem;  /* 48.8px */
--text-5xl: 3.815rem;  /* 61px */

/* 한글 행간 최적화 */
body {
  font-family: var(--font-primary);
  line-height: 1.7;  /* 한글은 1.6-1.8 권장 */
  letter-spacing: -0.01em;  /* 약간 타이트하게 */
}

h1, h2, h3 {
  line-height: 1.3;
  letter-spacing: -0.02em;
}
```

#### 창의적 타이포그래피 레이아웃
```css
/* 극단적 크기 대비 */
.hero-title {
  font-size: clamp(3rem, 15vw, 12rem);
  font-weight: 700;
  line-height: 0.9;
}

.hero-subtitle {
  font-size: clamp(0.875rem, 2vw, 1.125rem);
  font-weight: 400;
  opacity: 0.7;
}

/* 세로쓰기 (한글 특화) */
.vertical-text {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

/* 가변 폰트 애니메이션 */
@keyframes weight-shift {
  0%, 100% { font-variation-settings: 'wght' 300; }
  50% { font-variation-settings: 'wght' 700; }
}

.dynamic-text {
  font-family: 'Pretendard Variable';
  animation: weight-shift 3s ease-in-out infinite;
}
```

### 3. 레이아웃 시스템

#### 브로큰 그리드 (Broken Grid)
```css
/* ❌ 뻔한 그리드 */
.boring-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

/* ✅ 브로큰 그리드 */
.broken-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 1fr;
  grid-template-rows: auto auto;
  gap: 2rem 1.5rem;
}

.broken-grid > :nth-child(1) {
  grid-column: 1 / 3;
  grid-row: 1;
}

.broken-grid > :nth-child(2) {
  grid-column: 3;
  grid-row: 1 / 3;
}

.broken-grid > :nth-child(3) {
  grid-column: 1;
  grid-row: 2;
}

.broken-grid > :nth-child(4) {
  grid-column: 2;
  grid-row: 2;
  transform: translateY(-3rem);  /* 의도적 오프셋 */
}
```

#### 비대칭 레이아웃
```css
/* 대담한 비대칭 */
.asymmetric-hero {
  display: grid;
  grid-template-columns: 2fr 1fr;
  min-height: 100vh;
}

.content-left {
  padding: clamp(2rem, 10vw, 8rem);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.visual-right {
  background: var(--accent);
  clip-path: polygon(20% 0%, 100% 0%, 100% 100%, 0% 100%);
  /* 사선 컷 */
}

/* 반응형 */
@media (max-width: 768px) {
  .asymmetric-hero {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
  }
  
  .visual-right {
    clip-path: polygon(0% 10%, 100% 0%, 100% 100%, 0% 100%);
    min-height: 50vh;
  }
}
```

#### 겹치는 요소 (Overlapping)
```css
.overlap-section {
  position: relative;
  padding: 8rem 0;
}

.overlap-card {
  position: relative;
  z-index: 2;
  background: white;
  padding: 3rem;
  margin-top: -4rem;  /* 위 섹션과 겹침 */
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
}

.background-shape {
  position: absolute;
  top: 0;
  right: 0;
  width: 50%;
  height: 100%;
  background: var(--primary);
  opacity: 0.05;
  z-index: 1;
  clip-path: circle(70% at 100% 0%);
}
```

### 4. 컴포넌트 디자인

#### 독창적 버튼
```css
/* ❌ 뻔한 버튼 */
.boring-button {
  background: #3b82f6;
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* ✅ 독창적 버튼 예시 1: 언더라인 확장 */
.creative-button-1 {
  background: transparent;
  color: var(--primary);
  padding: 1rem 0;
  border: none;
  position: relative;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-size: 0.875rem;
}

.creative-button-1::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 2rem;
  height: 2px;
  background: var(--primary);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.creative-button-1:hover::after {
  width: 100%;
}

/* ✅ 독창적 버튼 예시 2: 네온 효과 (다크 모드) */
.creative-button-2 {
  background: transparent;
  color: var(--accent);
  padding: 1rem 2rem;
  border: 2px solid var(--accent);
  position: relative;
  overflow: hidden;
}

.creative-button-2::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: var(--accent);
  opacity: 0.2;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.creative-button-2:hover::before {
  width: 300px;
  height: 300px;
}

/* ✅ 독창적 버튼 예시 3: 모피즘 (Morphism) */
.creative-button-3 {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text);
  padding: 1rem 2rem;
  border-radius: 2rem;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.1);
}
```

#### 독창적 카드
```css
/* ❌ 뻔한 카드 */
.boring-card {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* ✅ 독창적 카드: 비스듬한 디자인 */
.creative-card {
  background: white;
  padding: 2rem;
  position: relative;
  border: none;
}

.creative-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    var(--primary),
    var(--accent)
  );
  transform: skewY(-2deg);
}

.creative-card:hover {
  transform: translateX(8px);
  transition: transform 0.3s ease;
}

/* ✅ 독창적 카드: 절단면 */
.cut-corner-card {
  background: var(--primary);
  color: white;
  padding: 2rem;
  clip-path: polygon(
    0% 0%,
    100% 0%,
    100% calc(100% - 2rem),
    calc(100% - 2rem) 100%,
    0% 100%
  );
}
```

### 5. 마이크로 인터랙션

#### 로딩 애니메이션
```css
/* ❌ 뻔한 스피너 */
.boring-spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

/* ✅ 창의적 로딩: 모피즘 펄스 */
.morphing-loader {
  width: 60px;
  height: 60px;
  background: var(--primary);
  animation: morph 2s ease-in-out infinite;
}

@keyframes morph {
  0%, 100% {
    border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
  }
  25% {
    border-radius: 58% 42% 75% 25% / 76% 46% 54% 24%;
  }
  50% {
    border-radius: 50% 50% 33% 67% / 55% 27% 73% 45%;
  }
  75% {
    border-radius: 33% 67% 58% 42% / 63% 68% 32% 37%;
  }
}
```

#### 호버 효과
```css
/* 카드 호버: 3D 기울임 */
.tilt-card {
  transition: transform 0.3s ease;
  transform-style: preserve-3d;
}

.tilt-card:hover {
  transform: 
    perspective(1000px)
    rotateX(5deg)
    rotateY(-5deg)
    scale(1.02);
}

/* 이미지 호버: 줌 + 오버레이 */
.image-container {
  position: relative;
  overflow: hidden;
}

.image-container img {
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.image-container:hover img {
  transform: scale(1.1);
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.7),
    transparent
  );
  opacity: 0;
  transition: opacity 0.3s ease;
}

.image-container:hover .image-overlay {
  opacity: 1;
}
```

### 6. 다크 모드 디자인

#### 다크 모드 색상 체계
```css
/* ❌ 단순히 색상만 반전 */
.bad-dark-mode {
  background: #000000;  /* 너무 어두움 */
  color: #ffffff;       /* 너무 밝음 */
}

/* ✅ 세심하게 조정된 다크 모드 */
:root {
  /* 라이트 모드 */
  --bg-primary: #FFFFFF;
  --bg-secondary: #F8F9FA;
  --bg-tertiary: #E9ECEF;
  --text-primary: #1F2937;
  --text-secondary: #4B5563;
  --text-tertiary: #9CA3AF;
  --border: #E5E7EB;
  --accent: #0D3B2E;
}

[data-theme="dark"] {
  /* 다크 모드 - 완전한 검정 피하기 */
  --bg-primary: #1A1D21;      /* 약간 푸른 검정 */
  --bg-secondary: #22262B;
  --bg-tertiary: #2C3136;
  --text-primary: #F3F4F6;     /* 순백이 아닌 약간 회색 */
  --text-secondary: #D1D5DB;
  --text-tertiary: #9CA3AF;
  --border: #374151;
  --accent: #4ADE80;           /* 밝은 그린으로 변경 */
}

/* 미디어 쿼리로 시스템 설정 감지 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg-primary: #1A1D21;
    --bg-secondary: #22262B;
    /* ... */
  }
}
```

#### 다크 모드 엘리베이션
```css
/* 다크 모드에서는 그림자 대신 밝기로 깊이 표현 */
.card {
  background: var(--bg-secondary);
}

/* 라이트 모드: 그림자로 깊이 */
:root:not([data-theme="dark"]) .card {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* 다크 모드: 밝기로 깊이 (가장 앞이 가장 밝음) */
[data-theme="dark"] .card {
  background: var(--bg-tertiary);
  box-shadow: 0 0 0 1px var(--border);
}

[data-theme="dark"] .card:hover {
  background: #363B42;  /* 호버 시 더 밝게 */
}
```

#### 다크 모드 토글 구현
```javascript
// 테마 토글 함수
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  // 부드러운 전환
  html.style.colorScheme = newTheme;
}

// 초기 로드 시 저장된 테마 적용
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const theme = savedTheme || (systemDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}

// 시스템 테마 변경 감지
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      document.documentElement.setAttribute(
        'data-theme',
        e.matches ? 'dark' : 'light'
      );
    }
  });
```

### 7. 모션 디자인 원칙

#### 애니메이션 타이밍
```css
/* ❌ 일관성 없는 타이밍 */
.bad-animation {
  transition: all 0.3s;
}

/* ✅ 의도적인 타이밍 시스템 */
:root {
  /* Duration Scale */
  --duration-instant: 50ms;    /* 즉각 반응 */
  --duration-fast: 150ms;      /* 빠른 피드백 */
  --duration-normal: 300ms;    /* 일반 전환 */
  --duration-slow: 500ms;      /* 강조 전환 */
  --duration-slower: 700ms;    /* 페이지 전환 */

  /* Easing Functions */
  --ease-linear: linear;
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  --ease-elastic: cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

/* 적용 예시 */
button {
  transition:
    transform var(--duration-fast) var(--ease-out),
    background-color var(--duration-normal) var(--ease-in-out);
}

.page-enter {
  animation: slideIn var(--duration-slow) var(--ease-out);
}
```

#### 의미 있는 모션
```css
/* 1. Entrance - 요소 등장 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-in {
  animation: fadeInUp var(--duration-normal) var(--ease-out) forwards;
}

/* 스태거 효과 (순차 등장) */
.stagger > * {
  opacity: 0;
  animation: fadeInUp var(--duration-normal) var(--ease-out) forwards;
}

.stagger > *:nth-child(1) { animation-delay: 0ms; }
.stagger > *:nth-child(2) { animation-delay: 100ms; }
.stagger > *:nth-child(3) { animation-delay: 200ms; }
.stagger > *:nth-child(4) { animation-delay: 300ms; }

/* 2. Feedback - 사용자 액션에 반응 */
button:active {
  transform: scale(0.97);
  transition: transform var(--duration-instant) var(--ease-out);
}

/* 3. Guidance - 주의 유도 */
.attention-pulse {
  animation: pulse 2s var(--ease-in-out) infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

#### Reduced Motion 지원
```css
/* 모션 민감 사용자를 위한 설정 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* 또는 선택적으로 적용 */
@media (prefers-reduced-motion: reduce) {
  .animate-in {
    animation: none;
    opacity: 1;
    transform: none;
  }

  /* 필수적인 피드백은 유지 */
  button:active {
    transform: scale(0.98);
  }
}
```

## 와이어프레임 & 프로토타입

### ASCII 와이어프레임 생성

#### 랜딩 페이지 구조
```
┌────────────────────────────────────────────────────────────┐
│                         HEADER                              │
│  [Logo]                    [Nav] [Nav] [Nav]   [CTA Btn]   │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                      HERO SECTION                           │
│                                                             │
│  ╔════════════════════╗         ┌──────────────────┐       │
│  ║                    ║         │                  │       │
│  ║   HEADLINE TEXT    ║         │   HERO IMAGE     │       │
│  ║   (비대칭 배치)     ║         │   or VIDEO       │       │
│  ║                    ║         │                  │       │
│  ╚════════════════════╝         └──────────────────┘       │
│                                                             │
│  [Primary CTA]  [Secondary CTA]                            │
│                                                             │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                    FEATURES (브로큰 그리드)                  │
│                                                             │
│  ┌─────────────────┐  ┌──────┐  ┌────────────────┐        │
│  │                 │  │      │  │                │        │
│  │   Feature 1     │  │  F2  │  │   Feature 3    │        │
│  │   (Large)       │  │      │  │                │        │
│  │                 │  └──────┘  │                │        │
│  └─────────────────┘             └────────────────┘        │
│                                                             │
│           ┌─────────────┐  ┌───────────────────┐           │
│           │  Feature 4  │  │    Feature 5      │           │
│           └─────────────┘  └───────────────────┘           │
│                                                             │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                    TESTIMONIALS                             │
│                  (비대칭 레이아웃)                            │
│                                                             │
│     ┏━━━━━━━━━━━━━━━━┓                                     │
│     ┃ "Great quote"  ┃    ┏━━━━━━━━━━━━┓                   │
│     ┃  - Customer A  ┃    ┃  "Quote 2" ┃                   │
│     ┗━━━━━━━━━━━━━━━━┛    ┃  - Cust. B ┃                   │
│                            ┗━━━━━━━━━━━━┛                   │
│                                                             │
│                  ┏━━━━━━━━━━━━━━━━━┓                        │
│                  ┃   "Quote 3"     ┃                        │
│                  ┃   - Customer C  ┃                        │
│                  ┗━━━━━━━━━━━━━━━━━┛                        │
│                                                             │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                          CTA                                │
│                                                             │
│              ╔══════════════════════════╗                   │
│              ║  최종 행동 유도 메시지    ║                   │
│              ╚══════════════════════════╝                   │
│                                                             │
│                   [Big CTA Button]                          │
│                                                             │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                        FOOTER                               │
│                                                             │
│  [Logo]          [Links]        [Social]      [Newsletter] │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

#### 대시보드 와이어프레임
```
┌──────────────────────────────────────────────────────────────────┐
│  [☰ Menu]  Dashboard                    [🔔] [👤 Profile ▼]     │
├────────────┬─────────────────────────────────────────────────────┤
│            │                                                     │
│ 📊 대시보드 │  ┌───────────┐ ┌───────────┐ ┌───────────┐        │
│ 📈 분석    │  │  KPI #1   │ │  KPI #2   │ │  KPI #3   │        │
│ 📁 프로젝트 │  │   1,234   │ │   567     │ │   89%     │        │
│ 👥 팀      │  └───────────┘ └───────────┘ └───────────┘        │
│ ⚙️ 설정    │                                                     │
│            │  ┌──────────────────────────┐ ┌──────────────────┐ │
│            │  │   주요 차트                │ │  활동 피드       │ │
│            │  │                          │ │                  │ │
│            │  │   📊 [차트 영역]          │ │  • 항목 1        │ │
│            │  │                          │ │  • 항목 2        │ │
│            │  │                          │ │  • 항목 3        │ │
│            │  └──────────────────────────┘ └──────────────────┘ │
│            │                                                     │
│            │  ┌─────────────────────────────────────────────┐   │
│            │  │         데이터 테이블                        │   │
│            │  ├─────┬────────┬────────┬────────┬───────────┤   │
│            │  │ ID  │ 이름   │ 상태   │ 날짜   │ 액션      │   │
│            │  ├─────┼────────┼────────┼────────┼───────────┤   │
│            │  │ ... │ ...    │ ...    │ ...    │ [버튼]    │   │
│            │  └─────┴────────┴────────┴────────┴───────────┘   │
│            │                                                     │
└────────────┴─────────────────────────────────────────────────────┘
```

### 사용자 플로우 다이어그램

```
                    ┌──────────────┐
                    │   랜딩 페이지  │
                    └───────┬──────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
       ┌───────────┐ ┌───────────┐ ┌───────────┐
       │  로그인    │ │  회원가입  │ │ 둘러보기  │
       └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
             │             │             │
             └─────────────┼─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  메인 대시보드 │
                    └───────┬──────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
       ┌───────────┐ ┌───────────┐ ┌───────────┐
       │ 프로필 설정│ │ 콘텐츠 탐색│ │ 설정     │
       └───────────┘ └─────┬─────┘ └───────────┘
                           │
                 ┌─────────┼─────────┐
                 │         │         │
                 ▼         ▼         ▼
          ┌─────────┐┌─────────┐┌─────────┐
          │ 상세보기 ││  저장    ││ 공유   │
          └─────────┘└─────────┘└─────────┘
```

## 반응형 디자인

### 브레이크포인트 전략
```css
/* 모바일 퍼스트 접근 */
:root {
  /* Breakpoints */
  --mobile: 320px;
  --mobile-l: 425px;
  --tablet: 768px;
  --laptop: 1024px;
  --laptop-l: 1440px;
  --desktop: 2560px;
}

/* 기본 (모바일) */
.container {
  padding: 1rem;
}

/* 태블릿 */
@media (min-width: 768px) {
  .container {
    padding: 2rem;
    max-width: 720px;
    margin: 0 auto;
  }
}

/* 랩톱 */
@media (min-width: 1024px) {
  .container {
    padding: 3rem;
    max-width: 960px;
  }
}

/* 데스크톱 */
@media (min-width: 1440px) {
  .container {
    max-width: 1200px;
  }
}
```

### Fluid Typography
```css
/* clamp를 활용한 유동적 크기 */
h1 {
  font-size: clamp(2rem, 5vw + 1rem, 4rem);
  /* 최소 2rem, 이상적 5vw + 1rem, 최대 4rem */
}

h2 {
  font-size: clamp(1.5rem, 3vw + 1rem, 3rem);
}

p {
  font-size: clamp(1rem, 2vw + 0.5rem, 1.25rem);
}

/* 컨테이너 쿼리 (최신 기능) */
@container (min-width: 700px) {
  .card h3 {
    font-size: 2rem;
  }
}
```

### 반응형 그리드
```css
/* ❌ 고정 그리드 */
.boring-grid {
  grid-template-columns: repeat(3, 1fr);
}

/* ✅ 자동 반응형 그리드 */
.responsive-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(300px, 100%), 1fr)
  );
  gap: 2rem;
}

/* ✅ Named Grid Areas */
.layout {
  display: grid;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
  grid-template-columns: 250px 1fr;
  gap: 1rem;
}

@media (max-width: 768px) {
  .layout {
    grid-template-areas:
      "header"
      "main"
      "sidebar"
      "footer";
    grid-template-columns: 1fr;
  }
}
```

## 접근성 (Accessibility)

### WCAG 2.1 가이드라인

#### 색상 대비
```css
/* 최소 대비비 4.5:1 (AA)  */
.good-contrast {
  background: #0D3B2E;  /* 어두운 녹색 */
  color: #F4F1E8;       /* 크림 */
  /* 대비비: 11.2:1 ✅ */
}

/* 큰 텍스트(18pt+)는 3:1 가능 (AA) */
.large-text {
  font-size: 1.5rem;
  background: #4A5568;
  color: #F7F7F7;
  /* 대비비: 5.8:1 ✅ */
}

/* AAA 기준: 7:1 */
.aaa-contrast {
  background: #1A1D1F;
  color: #FFFFFF;
  /* 대비비: 19.2:1 ✅✅✅ */
}
```

#### 키보드 네비게이션
```css
/* 포커스 인디케이터 (절대 outline: none 금지!) */
button:focus-visible,
a:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}

/* Skip to main content 링크 */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--primary);
  color: white;
  padding: 8px;
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}
```

#### 스크린 리더 지원
```html
<!-- 시맨틱 HTML -->
<header>
  <nav aria-label="주 메뉴">
    <ul>
      <li><a href="#home">홈</a></li>
      <li><a href="#about">소개</a></li>
    </ul>
  </nav>
</header>

<main id="main-content">
  <article>
    <h1>페이지 제목</h1>
  </article>
</main>

<!-- ARIA 레이블 -->
<button aria-label="메뉴 열기">
  <span aria-hidden="true">☰</span>
</button>

<!-- 숨겨진 설명 -->
<span class="sr-only">
  현재 페이지: 대시보드
</span>
```

```css
/* 스크린 리더 전용 텍스트 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

#### 터치 타겟 크기
```css
/* 최소 44x44px (모바일) */
.touch-target {
  min-width: 44px;
  min-height: 44px;
  padding: 0.75rem 1rem;
}

/* 충분한 간격 */
.button-group button {
  margin: 0.5rem;  /* 버튼 사이 최소 8px */
}
```

## 한글 웹사이트 특화 가이드

### 한글 타이포그래피 최적화

```css
/* 1. 적절한 폰트 선택 */
body {
  font-family: 
    'Pretendard Variable',  /* 가변 폰트, 성능 우수 */
    'Pretendard',
    -apple-system,
    BlinkMacSystemFont,
    'Apple SD Gothic Neo',
    'Noto Sans KR',
    sans-serif;
}

/* 2. 한글 행간 (영문보다 20-30% 넓게) */
p {
  line-height: 1.7;  /* 영문: 1.5, 한글: 1.6-1.8 */
}

h1, h2, h3 {
  line-height: 1.3;  /* 제목은 조금 타이트하게 */
}

/* 3. 자간 조정 */
body {
  letter-spacing: -0.01em;  /* 약간 타이트하게 */
}

h1 {
  letter-spacing: -0.02em;  /* 큰 제목은 더 타이트 */
}

/* 4. 단어 분리 방지 */
p {
  word-break: keep-all;  /* 한글 단어 단위로 줄바꿈 */
  overflow-wrap: break-word;  /* 긴 영문 단어만 분리 */
}

/* 5. 폰트 웨이트 최적화 */
/* 한글은 영문보다 획이 많아서 같은 웨이트여도 더 진하게 보임 */
h1 {
  font-weight: 700;  /* Bold */
}

body {
  font-weight: 400;  /* Regular (500은 너무 진함) */
}

.light-text {
  font-weight: 300;  /* Light */
}
```

### 한글 + 영문 혼용 처리
```css
/* 1. 폰트 폴백 */
.mixed-text {
  font-family: 
    'Pretendard Variable',  /* 한글 */
    'Inter',                /* 영문/숫자 */
    sans-serif;
}

/* 2. 숫자 폰트 분리 */
.numbers {
  font-family: 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;  /* 숫자 폭 고정 */
}

/* 3. 영문 대소문자 혼용 시 */
.mixed-case {
  text-transform: none;  /* 한글은 대소문자 없음 */
}
```

## HTML/CSS 생성 템플릿

### 랜딩 페이지 Full Stack
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>독창적인 랜딩 페이지</title>
  <style>
    /* CSS Variables */
    :root {
      --color-primary: #0D3B2E;
      --color-accent: #E8B54D;
      --color-text: #1F2421;
      --color-bg: #F4F1E8;
      
      --font-primary: 'Pretendard Variable', sans-serif;
      --font-display: 'Gowun Batang', serif;
      
      --spacing-unit: 0.5rem;
    }
    
    /* Reset */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    /* Base */
    body {
      font-family: var(--font-primary);
      color: var(--color-text);
      background: var(--color-bg);
      line-height: 1.7;
      letter-spacing: -0.01em;
      word-break: keep-all;
      overflow-wrap: break-word;
    }
    
    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2rem 5%;
      background: transparent;
      position: sticky;
      top: 0;
      backdrop-filter: blur(10px);
      z-index: 1000;
    }
    
    /* Hero Section - 비대칭 */
    .hero {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      min-height: 100vh;
      align-items: center;
      padding: 0 5%;
      gap: 4rem;
    }
    
    .hero-content h1 {
      font-family: var(--font-display);
      font-size: clamp(3rem, 10vw, 8rem);
      line-height: 1.1;
      letter-spacing: -0.03em;
      margin-bottom: 2rem;
      color: var(--color-primary);
    }
    
    .hero-visual {
      position: relative;
      min-height: 60vh;
      background: var(--color-accent);
      clip-path: polygon(15% 0%, 100% 0%, 100% 100%, 0% 100%);
    }
    
    /* Features - 브로큰 그리드 */
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
      padding: 8rem 5%;
    }
    
    .feature:nth-child(2) {
      transform: translateY(2rem);
    }
    
    .feature:nth-child(4) {
      transform: translateY(-2rem);
    }
    
    /* CTA - 독창적 버튼 */
    .cta-button {
      background: transparent;
      color: var(--color-primary);
      padding: 1.5rem 3rem;
      border: none;
      font-size: 1.125rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      position: relative;
      cursor: pointer;
    }
    
    .cta-button::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 3rem;
      height: 3px;
      background: var(--color-primary);
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .cta-button:hover::after {
      width: 100%;
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .hero {
        grid-template-columns: 1fr;
        min-height: auto;
        padding: 4rem 5%;
      }
      
      .hero-visual {
        min-height: 40vh;
        clip-path: polygon(0% 10%, 100% 0%, 100% 100%, 0% 100%);
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">로고</div>
    <nav>
      <a href="#features">기능</a>
      <a href="#about">소개</a>
      <a href="#contact">문의</a>
    </nav>
  </header>
  
  <section class="hero">
    <div class="hero-content">
      <h1>독창적인<br>디자인</h1>
      <p>뻔한 템플릿을 거부합니다</p>
      <button class="cta-button">시작하기</button>
    </div>
    <div class="hero-visual"></div>
  </section>
  
  <section class="features" id="features">
    <div class="feature">
      <h3>Feature 1</h3>
      <p>설명...</p>
    </div>
    <div class="feature">
      <h3>Feature 2</h3>
      <p>설명...</p>
    </div>
    <div class="feature">
      <h3>Feature 3</h3>
      <p>설명...</p>
    </div>
    <div class="feature">
      <h3>Feature 4</h3>
      <p>설명...</p>
    </div>
  </section>
</body>
</html>
```

## React 컴포넌트 템플릿

### 독창적 카드 컴포넌트
```jsx
import React from 'react';
import styled from 'styled-components';

const CardWrapper = styled.article`
  background: white;
  padding: 2rem;
  position: relative;
  transition: transform 0.3s ease;
  
  /* 독창적 요소: 비스듬한 강조선 */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 100%;
    background: linear-gradient(
      to bottom,
      var(--color-primary),
      var(--color-accent)
    );
    transform: skewY(-2deg);
  }
  
  &:hover {
    transform: translateX(8px);
  }
  
  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const CardTitle = styled.h3`
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--color-primary);
`;

const CardContent = styled.p`
  line-height: 1.7;
  color: var(--color-text);
  word-break: keep-all;
`;

function CreativeCard({ title, children }) {
  return (
    <CardWrapper>
      <CardTitle>{title}</CardTitle>
      <CardContent>{children}</CardContent>
    </CardWrapper>
  );
}

export default CreativeCard;
```

## 품질 체크리스트

생성된 디자인이 다음 기준을 만족하는지 확인:

### 🎨 창의성
- [ ] 경쟁사와 차별화되는 비주얼?
- [ ] shadcn/ui 기본 스타일과 다른가?
- [ ] 보라색 그라데이션 피했나?
- [ ] 예상을 깨는 요소가 있나?
- [ ] 브랜드 고유성이 있나?

### ♿ 접근성
- [ ] 색상 대비 4.5:1 이상?
- [ ] 키보드 네비게이션 가능?
- [ ] 스크린 리더 지원?
- [ ] 터치 타겟 44x44px 이상?
- [ ] 시맨틱 HTML 사용?

### 🇰🇷 한글 최적화
- [ ] Pretendard/Noto Sans KR 사용?
- [ ] 행간 1.6-1.8?
- [ ] word-break: keep-all?
- [ ] 자간 -0.01em?

### 📱 반응형
- [ ] 모바일 퍼스트 접근?
- [ ] 브레이크포인트 적절?
- [ ] Fluid Typography?
- [ ] 터치 친화적?

### ⚡ 성능
- [ ] 폰트 최적화 (Variable Font)?
- [ ] 이미지 최적화?
- [ ] CSS 최소화?
- [ ] 불필요한 애니메이션 제거?

## 성능 최적화 (Core Web Vitals)

### 목표 지표
```
┌─────────────────────────────────────────────────────────────┐
│                    Core Web Vitals 목표                      │
├──────────────┬──────────────┬──────────────┬───────────────┤
│     지표      │     Good     │ Needs Work   │     Poor      │
├──────────────┼──────────────┼──────────────┼───────────────┤
│ LCP          │   ≤ 2.5s     │   ≤ 4.0s     │    > 4.0s     │
│ (최대 콘텐츠)  │              │              │               │
├──────────────┼──────────────┼──────────────┼───────────────┤
│ INP          │   ≤ 200ms    │   ≤ 500ms    │    > 500ms    │
│ (상호작용)    │              │              │               │
├──────────────┼──────────────┼──────────────┼───────────────┤
│ CLS          │   ≤ 0.1      │   ≤ 0.25     │    > 0.25     │
│ (레이아웃 변화)│              │              │               │
└──────────────┴──────────────┴──────────────┴───────────────┘
```

### LCP 최적화
```css
/* 1. Critical CSS Inline */
<style>
  /* 첫 화면에 필요한 CSS만 인라인 */
  .hero { ... }
  .header { ... }
</style>

/* 2. 폰트 최적화 */
@font-face {
  font-family: 'Pretendard Variable';
  src: url('/fonts/PretendardVariable.woff2') format('woff2');
  font-display: swap;  /* FOUT 허용 */
  unicode-range: U+AC00-D7AF;  /* 한글만 */
}

/* 3. 이미지 최적화 */
.hero-image {
  content-visibility: auto;  /* 지연 렌더링 */
  contain-intrinsic-size: 800px 600px;  /* 플레이스홀더 크기 */
}
```

```html
<!-- LCP 이미지 우선 로드 -->
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high">

<!-- 반응형 이미지 -->
<img
  src="/hero-800.webp"
  srcset="/hero-400.webp 400w, /hero-800.webp 800w, /hero-1200.webp 1200w"
  sizes="(max-width: 600px) 400px, (max-width: 1200px) 800px, 1200px"
  alt="Hero Image"
  loading="eager"
  fetchpriority="high"
>
```

### CLS 방지
```css
/* 1. 이미지/비디오 공간 확보 */
img, video {
  aspect-ratio: 16 / 9;  /* 비율 지정 */
  width: 100%;
  height: auto;
}

/* 또는 명시적 크기 */
.hero-image {
  width: 100%;
  height: 400px;
  object-fit: cover;
}

/* 2. 폰트 로딩 시 레이아웃 변화 방지 */
body {
  font-family: 'Pretendard Variable', -apple-system, sans-serif;
  /* 시스템 폴백 폰트와 유사한 메트릭 */
}

/* 3. 동적 콘텐츠 공간 확보 */
.ad-container {
  min-height: 250px;
  background: #f0f0f0;
}

.skeleton {
  animation: pulse 1.5s infinite;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
}
```

### INP 최적화
```javascript
// 1. 긴 작업 분할
async function processLargeData(items) {
  for (const chunk of chunkArray(items, 50)) {
    await new Promise(resolve => setTimeout(resolve, 0));
    processChunk(chunk);
  }
}

// 2. 이벤트 위임
document.querySelector('.list').addEventListener('click', (e) => {
  if (e.target.matches('.item')) {
    handleItemClick(e.target);
  }
});

// 3. CSS contain 사용
.card {
  contain: layout style paint;  /* 리렌더링 범위 제한 */
}
```

## 브라우저 호환성

### 지원 브라우저 매트릭스
```
┌─────────────────────────────────────────────────────────────┐
│                    브라우저 지원 범위                         │
├──────────────┬──────────────────────────────────────────────┤
│ Chrome       │ 최신 2개 버전 (현재: 120+)                    │
├──────────────┼──────────────────────────────────────────────┤
│ Firefox      │ 최신 2개 버전 (현재: 120+)                    │
├──────────────┼──────────────────────────────────────────────┤
│ Safari       │ 최신 2개 버전 (현재: 16+)                     │
├──────────────┼──────────────────────────────────────────────┤
│ Edge         │ 최신 2개 버전 (Chromium 기반)                 │
├──────────────┼──────────────────────────────────────────────┤
│ Samsung      │ 최신 버전                                     │
├──────────────┼──────────────────────────────────────────────┤
│ iOS Safari   │ 15+ (아이폰 6s 이상)                          │
└──────────────┴──────────────────────────────────────────────┘
```

### 주의해야 할 CSS 기능
```css
/* ⚠️ Safari 호환성 주의 */

/* 1. gap in Flexbox - Safari 14.1+ */
.flex-container {
  display: flex;
  gap: 1rem;
}
/* 폴백 */
@supports not (gap: 1rem) {
  .flex-container > * + * {
    margin-left: 1rem;
  }
}

/* 2. aspect-ratio - Safari 15+ */
.image {
  aspect-ratio: 16 / 9;
}
/* 폴백 */
@supports not (aspect-ratio: 16 / 9) {
  .image::before {
    content: '';
    display: block;
    padding-top: 56.25%;
  }
}

/* 3. :has() - Safari 15.4+, Chrome 105+ */
.card:has(.badge) {
  border-color: gold;
}
/* 폴백: JavaScript로 처리 */

/* 4. Container Queries - Safari 16+, Chrome 105+ */
@container (min-width: 400px) {
  .card-title { font-size: 1.5rem; }
}
/* 폴백: 미디어 쿼리 사용 */

/* 5. Subgrid - Firefox OK, Chrome 117+, Safari 16+ */
.grid {
  display: grid;
  grid-template-columns: subgrid;
}
```

### 프리픽스 가이드
```css
/* Autoprefixer 권장, 수동 시 아래 참고 */

/* backdrop-filter */
.glass {
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}

/* clip-path */
.clip {
  -webkit-clip-path: polygon(...);
  clip-path: polygon(...);
}

/* appearance */
button {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}
```

## 테스트 도구

### 접근성 테스트
```bash
# 1. axe DevTools (Chrome Extension)
# - 실시간 접근성 감사
# - WCAG 위반 사항 자동 감지

# 2. Lighthouse (Chrome DevTools)
# - 접근성 점수 측정
# - 개선 제안 제공

# 3. WAVE (웹 서비스)
# https://wave.webaim.org/
# - 상세한 접근성 리포트

# 4. 스크린 리더 테스트
# - macOS: VoiceOver (Cmd + F5)
# - Windows: NVDA (무료)
# - Chrome: ChromeVox Extension
```

### 성능 테스트
```bash
# 1. Lighthouse CI
npx lighthouse https://example.com --output=json

# 2. WebPageTest
# https://www.webpagetest.org/

# 3. Chrome DevTools Performance
# - Network: Slow 3G 테스트
# - CPU: 4x slowdown 테스트

# 4. PageSpeed Insights
# https://pagespeed.web.dev/
```

### 크로스 브라우저 테스트
```bash
# 1. BrowserStack
# - 실제 기기에서 테스트
# - 자동화 지원

# 2. LambdaTest
# - 스크린샷 비교
# - 반응형 테스트

# 3. Playwright (로컬 자동화)
npm install -D @playwright/test

# playwright.config.js
export default {
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ]
}
```

### 디자인 QA 도구
```bash
# 1. Storybook
# - 컴포넌트 단위 테스트
# - 비주얼 리그레션 테스트
npm install -D @storybook/react

# 2. Chromatic
# - Storybook 연동
# - 자동 스크린샷 비교

# 3. Percy
# - 비주얼 테스트 자동화
# - CI/CD 통합

# 4. Figma 플러그인
# - "Anima" - Figma to Code
# - "Design Lint" - 디자인 일관성 검사
```

## 참고 자료

### 공식 문서
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN Web Docs](https://developer.mozilla.org/)
- [web.dev (Google)](https://web.dev/)

### 한글 리소스
- [한글 타이포그래피](https://typography.hangeul.org/)
- [Pretendard Font](https://github.com/orioncactus/pretendard)
- [눈누 (무료 한글 폰트)](https://noonnu.cc/)

### 도구
- [Can I Use](https://caniuse.com/) - 브라우저 호환성
- [Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Coolors](https://coolors.co/) - 색상 팔레트 생성
- [Realtime Colors](https://www.realtimecolors.com/) - 실시간 색상 미리보기

### 영감
- [Awwwards](https://www.awwwards.com/) - 수상작 갤러리
- [Dribbble](https://dribbble.com/) - 디자인 영감
- [Mobbin](https://mobbin.com/) - 모바일 UI 패턴

## 마무리

이 스킬을 사용하여:
1. **Verbalized Sampling** - 뻔한 것 식별 후 회피
2. **독창적 디자인** - 경쟁사와 차별화
3. **접근성** - 모두가 사용 가능한 디자인
4. **한글 최적화** - 한국 사용자를 위한 세심함
5. **품질 보증** - 체크리스트로 검증

뻔하지 않으면서도 실용적인 웹 디자인을 만들 수 있습니다!

---

## 변경 이력

### v2.0 (2026-01-15)
- **다크 모드 디자인** 섹션 추가
  - 색상 체계, 엘리베이션, 토글 구현
- **모션 디자인 원칙** 섹션 추가
  - 애니메이션 타이밍 시스템
  - Reduced Motion 지원
- **Core Web Vitals** 섹션 추가
  - LCP, INP, CLS 최적화 가이드
- **브라우저 호환성** 섹션 추가
  - 지원 범위, CSS 기능 폴백
- **테스트 도구** 섹션 추가
  - 접근성, 성능, 크로스 브라우저 테스트
- **When NOT to Use** 섹션 추가
- 참고 자료 확장
- 버전 정보 추가

### v1.0 (Initial)
- Verbalized Sampling 기법 소개
- Anti-Pattern 라이브러리
- 디자인 시스템 구축 가이드
- 색상, 타이포그래피, 레이아웃 시스템
- 컴포넌트 디자인 패턴
- 와이어프레임 템플릿
- 반응형 디자인 가이드
- 접근성 (WCAG 2.1) 가이드
- 한글 최적화 가이드
- HTML/CSS/React 템플릿

---

**작성**: Claude Code
**위치**: `.claude/skills/web-design-system/`
