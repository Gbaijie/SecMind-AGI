from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional

from langchain_core.messages import BaseMessage

from .types import LlmConfig


@dataclass(frozen=True)
class AgentRunInput:
    query: str
    history: Optional[List[dict]] = None


class BaseAgent:
    agent_id: str

    def run_stream(self, run_input: AgentRunInput, llm: LlmConfig) -> Iterable[str]:
        raise NotImplementedError

    def build_messages(self, run_input: AgentRunInput) -> List[BaseMessage]:
        raise NotImplementedError

