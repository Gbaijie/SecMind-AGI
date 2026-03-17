from __future__ import annotations

from typing import Iterable

from .base import AgentRunInput, BaseAgent
from .prompts import build_vector_agent_messages
from .types import LlmConfig
from .. import services


class VectorAgent(BaseAgent):
    agent_id = "rag"

    def run_stream(self, run_input: AgentRunInput, llm: LlmConfig) -> Iterable[str]:
        retrieved = []
        if services.log_system is not None:
            retrieved = services.log_system.retrieve_logs(run_input.query, top_k=5)
        snippets = ""
        if retrieved:
            lines = []
            for i, item in enumerate(retrieved, 1):
                score = float(item.get("score", 0.0))
                lines.append(f"[{i}] score={score:.2f} source={item.get('source','')}\n{item.get('content','')}")
            snippets = "\n\n".join(lines)
        else:
            snippets = "（无命中）"

        messages = build_vector_agent_messages(run_input.query, snippets, history=run_input.history)
        for chunk in services.stream_llm_from_messages(
            provider=llm.provider,
            messages=messages,
            model_name=llm.model,
            provider_api_key=llm.provider_api_key,
        ):
            yield chunk

