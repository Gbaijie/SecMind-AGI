from __future__ import annotations

import logging
from typing import Iterable

from .base import AgentRunInput, BaseAgent
from .prompts import build_search_agent_messages
from .types import LlmConfig
from .. import services

logger = logging.getLogger(__name__)


class SearchAgent(BaseAgent):
    agent_id = "web"

    def run_stream(self, run_input: AgentRunInput, llm: LlmConfig) -> Iterable[str]:
        results = services.web_search(run_input.query, max_results=5, web_search_api_key=run_input.web_search_api_key)
        logger.info("WebAgent 联网检索完成: query=%s, count=%s", run_input.query, len(results))
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

