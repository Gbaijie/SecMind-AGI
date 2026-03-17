from __future__ import annotations

from typing import Iterable

from .base import AgentRunInput, BaseAgent
from .prompts import build_search_agent_messages
from .types import LlmConfig
from .. import services


class SearchAgent(BaseAgent):
    agent_id = "web"

    def run_stream(self, run_input: AgentRunInput, llm: LlmConfig) -> Iterable[str]:
        results = services.real_web_search(run_input.query, max_results=5)
        if results:
            lines = []
            for i, item in enumerate(results, 1):
                source = item.get("source", "N/A")
                body = item.get("content", "")
                lines.append(f"[{i}] {source}\n{body}")
            snippets = "\n\n".join(lines)
        else:
            snippets = "（无结果或搜索失败）"

        messages = build_search_agent_messages(run_input.query, snippets, history=run_input.history)
        for chunk in services.stream_llm_from_messages(
            provider=llm.provider,
            messages=messages,
            model_name=llm.model,
            provider_api_key=llm.provider_api_key,
        ):
            yield chunk

