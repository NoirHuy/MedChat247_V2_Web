"""
src/core/settings.py
Cấu hình ứng dụng đọc từ biến môi trường / file .env.
Chỉ nạp .env một lần, KHÔNG ghi đè biến môi trường đã tồn tại trong shell.
"""

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Tuple

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class LLMSettings:
    base_url: str = ""
    api_key: str = ""
    model: str = "default"
    timeout: float = 15.0
    temperature: float = 0.7

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key)


def _get_llm_settings() -> LLMSettings:
    timeout_raw = os.getenv("LLM_TIMEOUT", "15")
    temperature_raw = os.getenv("LLM_TEMPERATURE", "0.7")
    try:
        timeout = float(timeout_raw)
    except ValueError:
        timeout = 15.0
    try:
        temperature = float(temperature_raw)
    except ValueError:
        temperature = 0.7
    # Fallback sang bộ biến môi trường dùng chung với Node back_end (NINEROUTER_*)
    # để trong docker-compose không phải khai báo lại API key cho nutrition service.
    base_url = os.getenv("LLM_BASE_URL", "").strip() or os.getenv("NINEROUTER_URL", "").strip()
    api_key = os.getenv("LLM_API_KEY", "").strip() or os.getenv("NINEROUTER_API", "").strip()
    model = (
        os.getenv("LLM_MODEL", "").strip()
        or os.getenv("OPENROUTER_MODEL_CHAT", "").strip()
        or "default"
    )
    return LLMSettings(
        base_url=base_url,
        api_key=api_key,
        model=model,
        timeout=timeout,
        temperature=temperature,
    )


@dataclass(frozen=True)
class Settings:
    llm: LLMSettings
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    neo4j_password_configured: bool
    cors_origins: Tuple[str, ...]
    nutrition_port: int


def _parse_cors_origins() -> Tuple[str, ...]:
    """Danh sách origin được phép gọi API. Mặc định chỉ cho phép dev frontend."""
    raw = os.getenv("CORS_ORIGINS", "")
    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    client_origin = os.getenv("CLIENT_ORIGIN", "").strip().rstrip("/")
    if client_origin and client_origin not in origins:
        origins.append(client_origin)
    # Origin mặc định cho môi trường phát triển (Vite + Flask cùng máy)
    for default_origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        if default_origin not in origins:
            origins.append(default_origin)
    return tuple(origins)


def _get_nutrition_port() -> int:
    raw = os.getenv("NUTRITION_PORT") or os.getenv("PORT") or "5000"
    try:
        return int(raw)
    except ValueError:
        return 5000


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Trả về cấu hình toàn cục (cache 1 lần đọc env)."""
    neo4j_password = os.getenv("NEO4J_PASSWORD", "")
    return Settings(
        llm=_get_llm_settings(),
        neo4j_uri=os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687"),
        neo4j_user=os.getenv("NEO4J_USER", "neo4j"),
        neo4j_password=neo4j_password,
        neo4j_password_configured=bool(neo4j_password),
        cors_origins=_parse_cors_origins(),
        nutrition_port=_get_nutrition_port(),
    )
