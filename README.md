# 🎬 유튜브 스크립트 번역 보고서 AI

유튜브 링크를 붙여넣으면 영상의 스크립트(자막)를 추출하고, Claude AI가 번역하여
**보고서 형식**(개요 · 핵심 요약 · 상세 내용 · 주요 용어 · 결론)으로 정리해 주는 웹 애플리케이션입니다.

## 동작 방식

```
유튜브 링크 입력
   → 자막 추출 (youtube-transcript-api, API 키 불필요)
   → Claude API로 번역 + 보고서 작성 (claude-opus-4-8, 스트리밍)
   → 웹 화면에 실시간 렌더링 / 마크다운 복사·다운로드
```

- 한국어 자막이 있으면 우선 사용하고, 없으면 영어 등 다른 언어 자막(자동 생성 포함)을 가져와 번역합니다.
- 보고서 언어는 한국어 외에 English / 日本語 / 中文 / Español을 선택할 수 있습니다.
- 자막에는 타임스탬프가 포함되어, 보고서의 각 섹션에 해당 구간이 표기됩니다.

## 설치 및 실행

```bash
# 1. 의존성 설치
pip install -r requirements.txt

# 2. API 키 설정 (https://console.anthropic.com 에서 발급)
cp .env.example .env
# .env 파일을 열어 ANTHROPIC_API_KEY 값을 입력

# 3. 서버 실행
uvicorn app.main:app --reload

# 4. 브라우저에서 접속
# http://localhost:8000
```

## 프로젝트 구조

```
app/
  main.py        # FastAPI 서버, SSE 스트리밍 엔드포인트
  transcript.py  # 유튜브 링크 → 비디오 ID → 자막 추출
  report.py      # Claude API 호출 (번역 + 보고서 생성)
static/
  index.html     # 웹 UI (외부 라이브러리 없이 동작)
```

## 참고 사항

- 자막이 아예 없는 영상(자막 비활성화)은 처리할 수 없습니다.
- 클라우드 서버(AWS 등)에 배포하면 유튜브가 데이터센터 IP를 차단하는 경우가 있습니다.
  이때는 `.env`에 `YT_HTTPS_PROXY=http://user:pass@proxy-host:port` 형식으로
  프록시를 설정하면 자막 요청이 프록시를 경유합니다.
- 자동 생성 자막의 오탈자는 AI가 문맥에 맞게 교정하여 번역합니다.
- 시스템 프롬프트에 프롬프트 캐싱을 적용하여 반복 사용 시 비용이 절감됩니다.
