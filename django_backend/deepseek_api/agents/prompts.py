from __future__ import annotations

from typing import List, Optional

from langchain.prompts import ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate, MessagesPlaceholder
from langchain_core.messages import BaseMessage, AIMessage, HumanMessage


def _format_history(history: Optional[List[dict]]) -> List[BaseMessage]:
    if not history:
        return []
    formatted: List[BaseMessage] = []
    for msg in history:
        role = (msg.get("role") or "").strip().lower()
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        if role == "user":
            formatted.append(HumanMessage(content=content))
        elif role == "assistant":
            formatted.append(AIMessage(content=content))
        else:
            formatted.append(AIMessage(content=content))
    return formatted


def build_vector_agent_messages(query: str, retrieved_snippets: str, history: Optional[List[dict]] = None) -> List[BaseMessage]:
    system = SystemMessagePromptTemplate.from_template(
        "你是 SOC 的知识库检索分析智能体（RAG Agent）。你只基于给定的日志/知识库命中内容进行分析，"
        "不允许凭空编造。输出应尽量结构化、可操作。"
    )
    user = HumanMessagePromptTemplate.from_template(
        "用户问题：\n{query}\n\n"
        "知识库命中（可能为空）：\n{snippets}\n\n"
        "请给出：\n"
        "1) 你从命中内容中得到的关键线索（要点列表）\n"
        "2) 初步判断/结论（若证据不足请明确说明）\n"
        "3) 建议的排查/处置步骤\n"
    )
    prompt = ChatPromptTemplate.from_messages([system, MessagesPlaceholder("chat_history"), user])
    return prompt.format_prompt(chat_history=_format_history(history), query=query, snippets=retrieved_snippets).to_messages()


def build_search_agent_messages(query: str, web_snippets: str, history: Optional[List[dict]] = None) -> List[BaseMessage]:
    system = SystemMessagePromptTemplate.from_template(
        "你是 SOC 的联网检索分析智能体（Web Search Agent）。你只基于给定的联网搜索摘要进行归纳，"
        "不要编造不存在的来源或数据。输出要给出关键信息点与可执行建议。"
    )
    user = HumanMessagePromptTemplate.from_template(
        "用户问题：\n{query}\n\n"
        "联网搜索摘要（可能为空）：\n{snippets}\n\n"
        "请给出：\n"
        "1) 搜索摘要中的关键信息点（要点列表）\n"
        "2) 与用户问题的直接关联结论\n"
        "3) 可能的进一步验证/实施建议\n"
    )
    prompt = ChatPromptTemplate.from_messages([system, MessagesPlaceholder("chat_history"), user])
    return prompt.format_prompt(chat_history=_format_history(history), query=query, snippets=web_snippets).to_messages()


def build_synthesis_agent_messages(
    query: str,
    rag_analysis: str,
    web_analysis: str,
    history: Optional[List[dict]] = None,
) -> List[BaseMessage]:
    system = SystemMessagePromptTemplate.from_template(
        "你是多智能体协同的综合智能体（Synthesis Agent）。你需要融合两个智能体的结论，"
        "给出最终面向用户的答案。若两者冲突，需说明原因并给出更稳妥的建议。"
    )
    user = HumanMessagePromptTemplate.from_template(
        "用户问题：\n{query}\n\n"
        "RAG Agent 输出：\n{rag}\n\n"
        "Web Search Agent 输出：\n{web}\n\n"
        "请输出最终答复（面向用户），要求：\n"
        "- 先给结论/建议，再给必要解释\n"
        "- 给出可执行的处置/排查清单\n"
        "- 避免输出内部过程描述（例如“我将进行步骤1/2”）\n"
    )
    prompt = ChatPromptTemplate.from_messages([system, MessagesPlaceholder("chat_history"), user])
    return prompt.format_prompt(chat_history=_format_history(history), query=query, rag=rag_analysis, web=web_analysis).to_messages()

