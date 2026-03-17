from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, Literal, Optional, TypedDict


AgentId = Literal["rag", "web", "synthesis"]


class SseEvent(TypedDict, total=False):
    type: str
    agent_id: AgentId
    status: str
    content: str
    error: str
    meta: Dict[str, Any]


@dataclass(frozen=True)
class LlmConfig:
    provider: str = "ollama"
    model: Optional[str] = None
    provider_api_key: Optional[str] = None


@dataclass(frozen=True)
class MultiAgentConfig:
    rag: LlmConfig
    web: LlmConfig
    synthesis: LlmConfig


def sse_agent_status(agent_id: AgentId, status: str, meta: Optional[Dict[str, Any]] = None) -> SseEvent:
    evt: SseEvent = {"type": "agent_status", "agent_id": agent_id, "status": status}
    if meta:
        evt["meta"] = meta
    return evt


def sse_agent_chunk(agent_id: AgentId, content: str) -> SseEvent:
    return {"type": "agent_chunk", "agent_id": agent_id, "content": content}


def sse_agent_error(agent_id: AgentId, error: str) -> SseEvent:
    return {"type": "agent_status", "agent_id": agent_id, "status": "error", "error": error}

