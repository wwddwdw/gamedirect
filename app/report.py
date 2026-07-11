"""Claude API로 스크립트를 번역하고 보고서 형식으로 정리하는 모듈."""

from collections.abc import Iterator

import anthropic

from .transcript import TranscriptResult

MODEL = "claude-opus-4-8"

SYSTEM_PROMPT = """\
당신은 유튜브 영상 스크립트를 분석해 보고서를 작성하는 전문 애널리스트입니다.

사용자가 유튜브 영상의 스크립트(타임스탬프 포함)를 제공하면, 지정된 언어로 번역·정리하여
아래 마크다운 구조의 보고서를 작성하세요.

# 📋 영상 분석 보고서

## 1. 개요
- 영상의 주제와 핵심 메시지를 2~4문장으로 요약

## 2. 핵심 요약
- 가장 중요한 포인트 3~7개를 불릿으로 정리

## 3. 상세 내용
- 스크립트 흐름에 따라 주제별 섹션(### 소제목)으로 나누어 정리
- 각 섹션 제목 옆에 해당 구간 타임스탬프를 표기 (예: ### 도입부 (00:00~02:15))
- 원문의 중요한 발언은 번역하여 인용구(>)로 포함

## 4. 주요 용어/인물/수치
- 영상에 등장하는 핵심 용어, 인물, 수치 데이터를 표로 정리 (해당 내용이 없으면 이 섹션 생략)

## 5. 결론 및 시사점
- 영상의 결론과 시청자가 얻을 수 있는 시사점 정리

규칙:
- 스크립트에 없는 내용을 지어내지 마세요.
- 자동 생성 자막의 오탈자는 문맥에 맞게 자연스럽게 교정하여 번역하세요.
- 전체 보고서는 반드시 사용자가 지정한 목표 언어로만 작성하세요.
"""


def stream_report(
    transcript: TranscriptResult,
    target_language: str = "한국어",
) -> Iterator[str]:
    """보고서 텍스트를 청크 단위로 스트리밍한다."""
    client = anthropic.Anthropic()

    user_message = (
        f"목표 언어: {target_language}\n"
        f"영상 ID: {transcript.video_id}\n"
        f"원본 자막 언어: {transcript.language}"
        f"{' (자동 생성)' if transcript.is_generated else ''}\n\n"
        f"아래 스크립트를 {target_language}로 번역·분석하여 보고서를 작성해 주세요.\n\n"
        f"<transcript>\n{transcript.text}\n</transcript>"
    )

    with client.messages.stream(
        model=MODEL,
        max_tokens=64000,
        thinking={"type": "adaptive"},
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        for text in stream.text_stream:
            yield text
