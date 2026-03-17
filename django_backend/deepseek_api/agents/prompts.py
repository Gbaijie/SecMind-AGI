from __future__ import annotations
from typing import List, Optional
from langchain.prompts import ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate, MessagesPlaceholder
from langchain_core.messages import BaseMessage, AIMessage, HumanMessage

# 保留原有的 _format_history 工具函数
def _format_history(history: Optional[List[dict]]) -> List[BaseMessage]:
    if not history: return []
    formatted: List[BaseMessage] = []
    for msg in history:
        role = (msg.get("role") or "").strip().lower()
        content = (msg.get("content") or "").strip()
        if not content: continue
        formatted.append(HumanMessage(content=content) if role == "user" else AIMessage(content=content))
    return formatted

def build_vector_agent_messages(query: str, retrieved_snippets: str, history: Optional[List[dict]] = None) -> List[BaseMessage]:
    """
    优化点：强调对内部五大数据库（CVE/IOC/攻击模式等）的特征提取，要求输出威胁判定逻辑。
    """
    system = SystemMessagePromptTemplate.from_template(
        "你现在是 DeepSOC 核心安全分析专家（RAG 专家层）。"
        "你的职责是深挖内部安全数据库（CVE 漏洞、IOC 情报、Web 攻击模式、安全案例库及处置策略）的关联信息。"
        "必须严守‘证据驱动’原则，仅基于检索内容分析，严禁编造不存在的特征。"
    )
    user = HumanMessagePromptTemplate.from_template(
        "### 待分析查询\n{query}\n\n"
        "### 内部库检索结果 (Context)\n{snippets}\n\n"
        "### 请按以下结构输出深度分析：\n"
        "1. **威胁特征匹配**：提取检索内容中与攻击者 IP、文件 Hash、CVE 编号或攻击特征（如 SQLi 载荷）匹配的线索。\n"
        "2. **内部风险研判**：根据检索到的案例和规则，判断当前行为是真实攻击、已知漏洞利用还是误报。\n"
        "3. **防御策略对标**：从处置策略模板库中提取最匹配的加固方案或缓解措施。\n"
    )
    prompt = ChatPromptTemplate.from_messages([system, MessagesPlaceholder("chat_history"), user])
    return prompt.format_prompt(chat_history=_format_history(history), query=query, snippets=retrieved_snippets).to_messages()

def build_search_agent_messages(query: str, web_snippets: str, history: Optional[List[dict]] = None) -> List[BaseMessage]:
    """
    优化点：侧重于威胁传递（Threat Intelligence）的时效性，关注 PoC 发布情况和外部黑客组织活跃度。
    """
    system = SystemMessagePromptTemplate.from_template(
        "你现在是 DeepSOC 外部威胁情报专家（Web Search 专家层）。"
        "你的任务是从海量互联网信息中提取最具实效性的情报，如：最新的漏洞 PoC、黑客组织（APT）动态、以及该资产/IP 在全球范围内的信誉。"
    )
    user = HumanMessagePromptTemplate.from_template(
        "### 用户查询\n{query}\n\n"
        "### 实时联网摘要\n{snippets}\n\n"
        "### 请提取并总结以下关键情报：\n"
        "1. **外部威胁态势**：该攻击手段或漏洞在野外（In-the-wild）的活跃程度及是否有公开利用脚本 (PoC)。\n"
        "2. **情报信誉度分析**：基于搜索结果，给出该指标（IP/Domain/Vulnerability）的风险评级建议。\n"
        "3. **外部验证建议**：建议用户通过哪些外部平台（如 VirusTotal, Shodan, Github）进行更深入的交叉验证。\n"
    )
    prompt = ChatPromptTemplate.from_messages([system, MessagesPlaceholder("chat_history"), user])
    return prompt.format_prompt(chat_history=_format_history(history), query=query, snippets=web_snippets).to_messages()

def build_synthesis_agent_messages(query: str, rag_analysis: str, web_analysis: str, history: Optional[List[dict]] = None) -> List[BaseMessage]:
    """
    优化点：作为“总指挥”，要求其进行冲突解决（Conflict Resolution），并生成结构化的 IR（事故响应）操作清单。
    """
    system = SystemMessagePromptTemplate.from_template(
        "你现在是 DeepSOC 首席运营官（Synthesis 决策层）。"
        "你需要对内部 RAG 专家和外部情报专家的结论进行逻辑整合。若内外信息冲突（如内网判定为合规测试但外网显示为恶意 IP），必须通过权重对比给出最稳妥的研判结论。"
    )
    user = HumanMessagePromptTemplate.from_template(
        "### 原始安全诉求\n{query}\n\n"
        "### 专家层输入\n"
        "**[RAG 专家分析]**：\n{rag}\n\n"
        "**[Web 专家分析]**：\n{web}\n\n"
        "### 请生成最终的 SOC 处置决策：\n"
        "1. **最终结论与定级**：一句话说明威胁性质及其严重程度（高/中/低）。\n"
        "2. **研判依据**：总结为什么得出此结论，若有专家分歧请说明你是如何权衡的。\n"
        "3. **紧急处置清单 (Immediate Actions)**：给出针对此事件的‘封禁/隔离/修复’具体步骤，要求按优先级排序。\n"
        "4. **中长期加固建议**：针对此类潜在风险，SOC 应如何优化规则或加固架构。\n"
        "--- (直接输出正文，不要包含‘好的，我明白了’等废话) ---"
    )
    prompt = ChatPromptTemplate.from_messages([system, MessagesPlaceholder("chat_history"), user])
    return prompt.format_prompt(chat_history=_format_history(history), query=query, rag=rag_analysis, web=web_analysis).to_messages()