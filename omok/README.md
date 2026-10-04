# 19×19 AI 오목 (Omok)

[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](http://unlicense.org/)
[![HTML5](https://img.shields.io/badge/HTML5-Canvas-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/ko/docs/Web/HTML)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/ko/docs/Web/JavaScript)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-success)](#)

HTML5 Canvas와 순수 JavaScript로 구현된 **19×19 표준 바둑판 규격의 인공지능(AI) 대전 오목 게임**입니다.  
별도의 설치 과정이나 빌드 도구 없이, 웹 브라우저에서 `index.html`을 여는 것만으로 즉시 플레이할 수 있습니다.

---

## ✨ 주요 기능

- **스마트폰/모바일 최적화 동적 자동 줌 (Dynamic Auto Zoom/Pan)**
  - 작은 모바일 화면에서도 착수 실수가 없도록 **처음에는 바둑판 중앙을 약 2.2배 크게 확대**하여 시작
  - 돌이 놓여갈 때마다 모든 돌(Bounding Box)과 주변 착수 공간이 한눈에 쏙 들어오도록 **부드러운 애니메이션으로 자동 축소 및 중심 이동**
  - 터치 드래그로 자유로운 시점 이동, 두 손가락 핀치 줌(Pinch-to-zoom), 마우스 휠 줌 지원
  - 플로팅 뷰 제어 버튼: 🎯 자동 줌 토글 / ⛶ 전체 바둑판 보기 / ＋, － 줌 조절

- **정통 19×19 규격 바둑판 렌더링**
  - 표준 19줄 격자 및 9개의 화점(Star points) 정밀 배치
  - 고급스러운 원목 나뭇결 배경 텍스처 및 입체 테두리
  - 실제 바둑돌 느낌의 3D 볼록 그라데이션 및 부드러운 그림자 효과
  - Retina 및 고해상도 디스플레이(DPI 스케일링) 지원
  - 착수 가이드(반투명 고스트 돌) 및 마지막 착수 위치 표시(레드 포인트)
  - 5목 완성 시 승리 골드 링 및 관통선 하이라이트

- **패턴 휴리스틱 기반 고성능 오목 AI**
  - 가로, 세로, 양방향 대각선의 오목 패턴 정밀 분석 (5목, 열린 4, 닫힌 4, 열린 3, 닫힌 3, 쌍삼, 사삼 등)
  - 플레이어의 공격을 즉각 감지하여 빈틈없이 방어하고, 기회가 오면 승리를 결정짓는 지능적인 착수
  - 3단계 난이도 선택: **쉬움 (Easy)** / **보통 (Normal)** / **어려움 (Hard)**
  - 361칸 중 유효 착수 주변부 후보수를 압축 탐색하여 딜레이 없이 즉각 반응

- **편의 및 대전 기능**
  - **진영 선택**: 플레이어 흑돌(선공) 또는 백돌(후공, AI가 흑돌 선공) 자유 선택
  - **무르기 (Undo)**: 실수했을 때 직전 턴 되돌리기 지원 (되돌린 후 뷰 자동 재조정)
  - **Web Audio API 내장 사운드**: 외부 오디오 파일 없이 웹 브라우저 자체 신디사이저로 바둑돌의 경쾌한 '딱' 소리와 승리 효과음 구현 (음소거 토글 가능)
  - **대전 전적 기록**: `localStorage`를 통해 승/패/무 통계 자동 저장 및 초기화 기능
  - **완전 무설치 (Zero Dependencies)**: 로컬 파일(`file://`)로 직접 열어도 CORS 제약 없이 동작

---

## 🚀 빠른 시작 (Getting Started)

### 1. 직접 열기 (가장 간단)
저장소를 다운로드하거나 클론한 후, `index.html` 파일을 더블 클릭하여 브라우저(Chrome, Edge, Safari 등)로 바로 실행합니다.

```bash
git clone https://github.com/YOUR_USERNAME/omok.git
cd omok
# index.html을 브라우저로 열기
```

### 2. 로컬 웹 서버로 실행 (선택 사항)
Python을 사용하여 간단한 로컬 HTTP 서버를 띄울 수도 있습니다.

```bash
# Python 3
python -m http.server 8000
```
브라우저에서 `http://localhost:8000` 주소로 접속합니다.

---

## 📁 프로젝트 구조

```
omok/
├── index.html          # 게임 메인 UI 구조, 대시보드 및 뷰포트 오버레이 컨트롤
├── style.css           # 반응형 레이아웃, 모바일 터치 및 다크 테마 스타일
├── js/
│   ├── board.js        # 19x19 보드 모델, 착수 검증, 5목 판정, 무르기 로직
│   ├── ai.js           # 패턴 평가 휴리스틱 및 난이도별 최적 수 계산 엔진
│   └── game.js         # 동적 카메라(줌/패닝), Canvas 그래픽 렌더링, 제스처 및 게임 제어
├── test_runner.html    # 규칙 및 AI 수비/공격 자동 단위 테스트 러너
├── LICENSE             # The Unlicense 라이선스 전문
└── README.md           # 프로젝트 문서
```

---

## 📱 스마트폰 조작 안내

- **착수**: 원하는 교차점을 가볍게 터치(탭)하면 돌이 놓입니다.
- **화면 이동**: 바둑판을 손가락으로 드래그하면 원하는 영역으로 시점이 이동합니다.
- **확대/축소**: 두 손가락으로 핀치 인/아웃하거나 우측 상단의 ＋/－ 버튼을 누릅니다.
- **자동 줌 복귀**: 상단의 **[🎯 자동 줌]** 버튼을 누르면 다시 모든 돌이 보이도록 자동으로 카메라가 맞추어집니다.
- **전체 보기**: 상단의 **[⛶ 전체]** 버튼을 누르면 즉시 19×19 판 전체를 한눈에 볼 수 있습니다.

---

## 📄 라이선스 (License)

이 프로젝트는 [The Unlicense](LICENSE)에 따라 퍼블릭 도메인으로 배포됩니다.  
누구나 상업적/비상업적 목적을 불문하고 자유롭게 복제, 수정, 배포, 사용할 수 있습니다.
