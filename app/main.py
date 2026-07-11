"""유튜브 스크립트 번역·보고서 생성 웹 서버."""

import json
import logging
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from .report import stream_report
from .transcript import TranscriptError, fetch_transcript

load_dotenv()

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="YouTube Script Report AI")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


class ReportRequest(BaseModel):
    url: str
    target_language: str = "한국어"


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/report")
def create_report(req: ReportRequest) -> StreamingResponse:
    def generate():
        try:
            transcript = fetch_transcript(req.url)
        except TranscriptError as e:
            yield _sse("error", {"message": str(e)})
            return
        except Exception:
            logger.exception("transcript fetch failed for url=%s", req.url)
            yield _sse("error", {"message": "자막을 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."})
            return

        yield _sse(
            "meta",
            {
                "video_id": transcript.video_id,
                "source_language": transcript.language,
                "is_generated": transcript.is_generated,
            },
        )

        try:
            for chunk in stream_report(transcript, req.target_language):
                yield _sse("delta", {"text": chunk})
        except anthropic.AuthenticationError:
            yield _sse("error", {"message": "ANTHROPIC_API_KEY가 설정되지 않았거나 올바르지 않습니다."})
            return
        except anthropic.RateLimitError:
            yield _sse("error", {"message": "요청이 많아 잠시 제한되었습니다. 1분 후 다시 시도해 주세요."})
            return
        except anthropic.APIStatusError as e:
            yield _sse("error", {"message": f"AI 서버 오류가 발생했습니다. (HTTP {e.status_code})"})
            return
        except anthropic.APIConnectionError:
            yield _sse("error", {"message": "AI 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요."})
            return

        yield _sse("done", {})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
