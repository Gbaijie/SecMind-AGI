import json
import logging
import re
from datetime import datetime
from typing import Generator, Optional

from django.conf import settings
from django.http import HttpRequest, StreamingHttpResponse
from ninja import File, NinjaAPI, Router
from ninja.files import UploadedFile as NinjaUploadedFile

from . import services
from .dashboard_stats import build_dashboard_stats
from .models import APIKey
from .schemas import LoginIn, LoginOut, ChatIn, ChatOut, HistoryOut, ErrorResponse
from .services import get_or_create_session, model_api_call

logger = logging.getLogger(__name__)

api = NinjaAPI(title="DeepSeek-R1:7B API", version="0.0.1")


def api_key_auth(request):
    """验证请求头中的 API Key"""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    try:
        scheme, key = auth_header.split()
        if scheme.lower() != "bearer":
            return None
        api_key = APIKey.objects.get(key=key)
        return api_key
    except (ValueError, APIKey.DoesNotExist):
        return None


router = Router(auth=api_key_auth)


def clean_llm_reply(reply: str) -> str:
    """
    从模型原始回复中移除 <think>...</think> 标签块，仅保留用户可见回复。
    """
    return re.sub(r"<think>.*?</think>\s*", "", reply, flags=re.DOTALL).strip()


@api.post("/login", response={200: LoginOut, 400: ErrorResponse, 403: ErrorResponse})
def login(request, data: LoginIn):
    username = data.username.strip()
    password = data.password.strip()
    if not username or not password:
        return 400, {"error": "用户名和密码不能为空"}
    if password != "secret":
        return 403, {"error": "密码错误"}
    key = services.create_api_key(username)
    return {"api_key": key, "expiry": settings.TOKEN_EXPIRY_SECONDS}


@router.post("/chat")
def chat(request, data: ChatIn):
    if not request.auth:
        return StreamingHttpResponse(
            "data: " + json.dumps({"type": "error", "chunk": "请先登录获取API Key"}) + "\n\n",
            status=401,
            content_type="text/event-stream",
        )

    session_id = data.session_id.strip() or "默认对话"
    user_input = data.user_input.strip()
    if not user_input:
        return StreamingHttpResponse(
            "data: " + json.dumps({"type": "error", "chunk": "请输入消息内容"}) + "\n\n",
            status=400,
            content_type="text/event-stream",
        )

    user = request.auth
    session = get_or_create_session(session_id, user)

    use_db_search = data.use_db_search
    use_web_search = data.use_web_search
    selected_model = data.model_name
    selected_provider = (data.provider or "ollama").strip().lower()
    provider_api_key = data.provider_api_key

    logger.info(
        f"搜索选项 - 数据库: {use_db_search}, 联网: {use_web_search}, provider: {selected_provider}, model: {selected_model or 'default'}"
    )

    if data.context and len(data.context) > 0:
        logger.info(f"使用前端提供的 context (会话: {session_id}, 上下文长度: {len(data.context)})")
        history_for_llm = data.context
        is_regeneration = False
    else:
        conversation_history = session.get_conversation_history()
        history_for_llm = conversation_history
        is_regeneration = False

        if (
            len(conversation_history) >= 2
            and conversation_history[-1]["role"] == "assistant"
            and conversation_history[-2]["role"] == "user"
            and conversation_history[-2]["content"] == user_input
        ):
            logger.info(f"检测到重新生成 (会话: {session_id})")
            history_for_llm = conversation_history[:-2]
            is_regeneration = True

        elif (
            len(conversation_history) >= 1
            and conversation_history[-1]["role"] == "user"
            and conversation_history[-1]["content"] == user_input
        ):
            logger.info(f"检测到对失败消息的重新生成 (会话: {session_id})")
            history_for_llm = conversation_history[:-1]
            is_regeneration = True

    def stream_generator() -> Generator[str, None, None]:
        full_clean_reply = ""

        try:
            for raw_chunk in model_api_call(
                user_input,
                history_for_llm,
                use_db_search,
                use_web_search,
                model_name=selected_model,
                provider=selected_provider,
                provider_api_key=provider_api_key,
            ):
                if not raw_chunk:
                    continue

                yield "data: " + json.dumps({"type": "content", "chunk": raw_chunk}) + "\n\n"
                full_clean_reply += raw_chunk

            try:
                final_save = full_clean_reply.strip()

                if data.context and len(data.context) > 0:
                    new_context_str = ""
                    for msg in history_for_llm:
                        if msg["role"] == "user":
                            new_context_str += f"\n用户：{msg['content']}\n"
                        elif msg["role"] == "assistant":
                            new_context_str += f"\n回复：{msg['content']}\n"

                    new_context_str += f"\n用户：{user_input}\n"
                    new_context_str += f"\n回复：{final_save}\n"
                    session.context = new_context_str.strip()
                    session.save()
                    logger.info(f"编辑模式：会话 {session_id} 已更新 (用户: {user.user})")

                elif is_regeneration:
                    new_context_str = ""
                    for msg in history_for_llm:
                        if msg["role"] == "user":
                            new_context_str += f"\n用户：{msg['content']}\n"
                        elif msg["role"] == "assistant":
                            new_context_str += f"\n回复：{msg['content']}\n"

                    new_context_str += f"\n用户：{user_input}\n"
                    new_context_str += f"\n回复：{final_save}\n"
                    session.context = new_context_str.strip()
                    session.save()

                else:
                    session.update_context(user_input, final_save)

                logger.info(f"会话 {session_id} 已更新 (用户: {user.user})")
            except Exception as e:
                logger.error(f"数据库上下文更新失败: {e}")

        except Exception as e:
            logger.error(f"流式生成失败: {e}")
            yield "data: " + json.dumps({"type": "error", "chunk": f"流处理失败: {e}"}) + "\n\n"

    response = StreamingHttpResponse(stream_generator(), content_type="text/event-stream")
    response["X-Accel-Buffering"] = "no"
    return response


@router.get("/history", response={200: HistoryOut})
def history(request, session_id: str = "默认对话"):
    processed_session_id = session_id.strip() or "默认对话"
    session = services.get_or_create_session(processed_session_id, request.auth)
    return {"history": session.context}


@router.delete("/history", response={200: dict})
def clear_history(request, session_id: str = "默认对话"):
    processed_session_id = session_id.strip() or "默认对话"
    session = services.get_or_create_session(processed_session_id, request.auth)
    session.clear_context()
    return {"message": "历史记录已清空"}


@router.get("/dashboard/stats", response={200: dict})
def get_dashboard_stats(request):
    """聚合 data/log 下真实 CSV 日志，返回大屏图表与拓扑数据。"""
    return build_dashboard_stats()


@router.post("/upload_file")
def upload_file(request, file: NinjaUploadedFile = File(...)):
    if not request.auth:
        return 401, {"error": "请先登录获取API Key"}

    filename = (file.name or "").lower()
    try:
        if filename.endswith(".txt"):
            content_bytes = file.read()
            try:
                text = content_bytes.decode("utf-8")
            except Exception:
                text = content_bytes.decode("gbk", errors="ignore")
            return {"text": text}

        if filename.endswith(".docx"):
            try:
                from docx import Document
            except Exception:
                return 400, {"error": "缺少依赖：请安装 python-docx"}

            document = Document(file)
            paragraphs = [p.text for p in document.paragraphs if p.text]
            text = "\n".join(paragraphs)
            return {"text": text}

        if filename.endswith(".xlsx"):
            try:
                import openpyxl
            except Exception:
                return 400, {"error": "缺少依赖：请安装 openpyxl"}

            wb = openpyxl.load_workbook(file, data_only=True)
            lines = []
            for ws in wb.worksheets:
                lines.append(f"# 工作表: {ws.title}")
                for row in ws.iter_rows(values_only=True):
                    cells = ["" if v is None else str(v) for v in row]
                    lines.append("\t".join(cells))
            text = "\n".join(lines)
            return {"text": text}

        return 400, {"error": "不支持的文件类型，仅支持 .txt / .docx / .xlsx"}

    except Exception as e:
        logger.error(f"文件解析失败: {e}")
        return 400, {"error": f"文件解析失败: {e}"}


api.add_router("", router)
