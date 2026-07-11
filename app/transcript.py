"""유튜브 링크에서 스크립트(자막)를 추출하는 모듈."""

import os
import re
from dataclasses import dataclass

import requests
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    VideoUnavailable,
)
from youtube_transcript_api.proxies import GenericProxyConfig

# 자막을 찾을 때 우선적으로 시도할 언어 순서
PREFERRED_LANGUAGES = ["ko", "en", "en-US", "en-GB", "ja", "zh-Hans", "zh-Hant", "es", "fr", "de"]

_VIDEO_ID_PATTERNS = [
    r"(?:v=|/videos/|embed/|youtu\.be/|/v/|/e/|watch\?v=|shorts/|live/)([0-9A-Za-z_-]{11})",
    r"^([0-9A-Za-z_-]{11})$",
]


class TranscriptError(Exception):
    """사용자에게 보여줄 수 있는 스크립트 추출 오류."""


@dataclass
class TranscriptResult:
    video_id: str
    language: str
    language_code: str
    is_generated: bool
    text: str  # "[MM:SS] 문장" 형식의 전체 스크립트


def extract_video_id(url: str) -> str:
    url = url.strip()
    for pattern in _VIDEO_ID_PATTERNS:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise TranscriptError("유효한 유튜브 링크가 아닙니다. 예: https://www.youtube.com/watch?v=XXXXXXXXXXX")


def _format_timestamp(seconds: float) -> str:
    total = int(seconds)
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _build_api() -> YouTubeTranscriptApi:
    # 클라우드 서버 IP가 유튜브에 차단된 경우를 위한 프록시 설정 (선택)
    http_proxy = os.getenv("YT_HTTP_PROXY")
    https_proxy = os.getenv("YT_HTTPS_PROXY")
    if http_proxy or https_proxy:
        return YouTubeTranscriptApi(
            proxy_config=GenericProxyConfig(http_url=http_proxy, https_url=https_proxy)
        )
    return YouTubeTranscriptApi()


def fetch_transcript(url: str) -> TranscriptResult:
    video_id = extract_video_id(url)
    api = _build_api()

    try:
        transcript_list = api.list(video_id)
    except TranscriptsDisabled:
        raise TranscriptError("이 영상은 자막(스크립트)이 비활성화되어 있습니다.")
    except VideoUnavailable:
        raise TranscriptError("영상을 찾을 수 없습니다. 링크를 다시 확인해 주세요.")
    except (IpBlocked, RequestBlocked):
        raise TranscriptError(
            "유튜브가 서버의 요청을 차단했습니다. 잠시 후 다시 시도하거나, "
            "YT_HTTPS_PROXY 환경변수로 프록시를 설정해 주세요."
        )
    except requests.exceptions.RequestException:
        raise TranscriptError("유튜브에 접속할 수 없습니다. 서버의 네트워크(방화벽/프록시) 설정을 확인해 주세요.")

    transcript = None
    # 1) 사람이 직접 올린 자막 우선, 2) 자동 생성 자막, 3) 아무 자막이나
    for finder in (transcript_list.find_manually_created_transcript,
                   transcript_list.find_generated_transcript):
        try:
            transcript = finder(PREFERRED_LANGUAGES)
            break
        except NoTranscriptFound:
            continue
    if transcript is None:
        try:
            transcript = next(iter(transcript_list))
        except StopIteration:
            raise TranscriptError("이 영상에서 사용할 수 있는 자막을 찾지 못했습니다.")

    fetched = transcript.fetch()
    lines = [
        f"[{_format_timestamp(snippet.start)}] {snippet.text.strip()}"
        for snippet in fetched
        if snippet.text.strip()
    ]
    if not lines:
        raise TranscriptError("자막이 비어 있습니다.")

    return TranscriptResult(
        video_id=video_id,
        language=transcript.language,
        language_code=transcript.language_code,
        is_generated=transcript.is_generated,
        text="\n".join(lines),
    )
