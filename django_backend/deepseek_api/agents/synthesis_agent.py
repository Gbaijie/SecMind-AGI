from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional, List

from .prompts import build_synthesis_agent_messages
from .types import LlmConfig
from .. import services


@dataclass(frozen=True)
class SynthesisInput:
    query: str
    rag_payload_json: str
    web_payload_json: str
    history: Optional[List[dict]] = None


class SynthesisAgent:
    agent_id = "synthesis"

    def run_stream(self, run_input: SynthesisInput, llm: LlmConfig) -> Iterable[str]:
        messages = build_synthesis_agent_messages(
            query=run_input.query,
            rag_payload_json=run_input.rag_payload_json,
            web_payload_json=run_input.web_payload_json,
            history=run_input.history,
        )
        for chunk in services.stream_llm_from_messages(
            provider=llm.provider,
            messages=messages,
            model_name=llm.model,
            provider_api_key=llm.provider_api_key,
        ):
            yield chunk

