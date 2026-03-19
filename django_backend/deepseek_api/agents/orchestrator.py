from __future__ import annotations

import queue
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from .base import AgentRunInput
from .search_agent import SearchAgent
from .synthesis_agent import SynthesisAgent, SynthesisInput
from .types import AgentId, MultiAgentConfig, SseEvent, sse_agent_chunk, sse_agent_error, sse_agent_status
from .vector_agent import VectorAgent


@dataclass(frozen=True)
class OrchestratorInput:
    query: str
    history: Optional[List[dict]] = None
    enable_rag: bool = True
    enable_web: bool = True
    web_search_api_key: Optional[str] = None


class Orchestrator:
    def __init__(self) -> None:
        self._vector = VectorAgent()
        self._search = SearchAgent()
        self._synthesis = SynthesisAgent()

    def _run_single_agent(
        self,
        agent_id: AgentId,
        run_input: OrchestratorInput,
        cfg: MultiAgentConfig,
        q: "queue.Queue[SseEvent]",
        outputs: Dict[AgentId, List[str]],
        out_lock: threading.Lock,
    ) -> None:
        try:
            q.put(sse_agent_status(agent_id, "started", meta={"ts": time.time()}))

            if agent_id == "rag" and not run_input.enable_rag:
                q.put(sse_agent_status(agent_id, "done", meta={"ts": time.time(), "skipped": True}))
                return
            if agent_id == "web" and not run_input.enable_web:
                q.put(sse_agent_status(agent_id, "done", meta={"ts": time.time(), "skipped": True}))
                return

            if agent_id == "rag":
                stream = self._vector.run_stream(AgentRunInput(query=run_input.query, history=run_input.history), cfg.rag)
            elif agent_id == "web":
                stream = self._search.run_stream(
                    AgentRunInput(
                        query=run_input.query,
                        history=run_input.history,
                        web_search_api_key=run_input.web_search_api_key,
                    ),
                    cfg.web,
                )
            else:
                raise ValueError(f"unexpected agent_id: {agent_id}")

            for chunk in stream:
                if not chunk:
                    continue
                with out_lock:
                    outputs[agent_id].append(chunk)
                q.put(sse_agent_chunk(agent_id, chunk))

            q.put(sse_agent_status(agent_id, "done", meta={"ts": time.time()}))
        except Exception as e:
            detail = getattr(e, "detail", None)
            q.put(sse_agent_error(agent_id, str(e), error_detail=detail if isinstance(detail, dict) else None))
            q.put(sse_agent_status(agent_id, "done", meta={"ts": time.time(), "degraded": True}))

    def run_stream(self, run_input: OrchestratorInput, cfg: MultiAgentConfig) -> Iterable[SseEvent]:
        """并发执行 rag/web，完成后运行 synthesis，并按 SSE 逐条输出状态与内容。"""
        q: "queue.Queue[SseEvent]" = queue.Queue()
        done: Dict[AgentId, bool] = {"rag": False, "web": False, "synthesis": False}
        outputs: Dict[AgentId, List[str]] = {"rag": [], "web": [], "synthesis": []}
        out_lock = threading.Lock()

        with ThreadPoolExecutor(max_workers=2) as executor:
            executor.submit(self._run_single_agent, "rag", run_input, cfg, q, outputs, out_lock)
            executor.submit(self._run_single_agent, "web", run_input, cfg, q, outputs, out_lock)

            while not (done["rag"] and done["web"]):
                evt = q.get()
                if evt.get("type") == "agent_status" and evt.get("status") == "done":
                    agent_id = evt.get("agent_id")
                    if agent_id in ("rag", "web"):
                        done[agent_id] = True
                yield evt

        rag_text = "".join(outputs["rag"]).strip()
        web_text = "".join(outputs["web"]).strip()

        yield sse_agent_status("synthesis", "started", meta={"ts": time.time()})
        try:
            synth_input = SynthesisInput(
                query=run_input.query,
                rag_analysis=rag_text or "（RAG 输出为空）",
                web_analysis=web_text or "（Web 输出为空）",
                history=run_input.history,
            )
            for chunk in self._synthesis.run_stream(synth_input, cfg.synthesis):
                if not chunk:
                    continue
                with out_lock:
                    outputs["synthesis"].append(chunk)
                yield sse_agent_chunk("synthesis", chunk)
            yield sse_agent_status("synthesis", "done", meta={"ts": time.time()})
        except Exception as e:
            detail = getattr(e, "detail", None)
            yield sse_agent_error("synthesis", str(e), error_detail=detail if isinstance(detail, dict) else None)
            yield sse_agent_status("synthesis", "done", meta={"ts": time.time(), "degraded": True})
