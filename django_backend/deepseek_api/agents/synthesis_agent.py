from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional, List

from .prompts import build_synthesis_agent_messages
from .types import LlmConfig
from .. import services


@dataclass(frozen=True)
class SynthesisInput:
    query: str
    rag_analysis: str
    web_analysis: str
    history: Optional[List[dict]] = None


class SynthesisAgent:
    agent_id = "synthesis"

    def run_stream(self, run_input: SynthesisInput, llm: LlmConfig) -> Iterable[str]:
        messages = build_synthesis_agent_messages(
            query=run_input.query,
            rag_analysis=run_input.rag_analysis,
            web_analysis=run_input.web_analysis,
            history=run_input.history,
        )
        for chunk in services.stream_llm_from_messages(
            provider=llm.provider,
            messages=messages,
            model_name=llm.model,
            provider_api_key=llm.provider_api_key,
        ):
            yield chunk

