"""
src/database/neo4j_client.py
Client quản lý kết nối và thực thi truy vấn Cypher với cơ sở dữ liệu Neo4j.

Cấu hình đọc từ biến môi trường NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD /
NEO4J_DATABASE (xem .env.example). Không còn mật khẩu mặc định cứng trong mã
nguồn — thiếu cấu hình sẽ báo lỗi rõ ràng.

Multi-Database Isolation: toàn bộ session chạy trên database khai báo trong
NEO4J_DATABASE (mặc định `nutrition`) để cách ly hoàn toàn với dữ liệu y khoa
trên cùng instance. Nếu server là Neo4j Community (chỉ hỗ trợ 1 database) hoặc
database chưa tồn tại, client tự fallback về database mặc định `neo4j` và ghi
cảnh báo — dữ liệu dinh dưỡng vẫn tách biệt về mặt label
(Food/Ingredient/Nutrient/ChronicCondition vs Symptom/Disease/AgeGroup/Sex).
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

from neo4j import Driver, GraphDatabase
from neo4j.exceptions import Neo4jError

logger = logging.getLogger(__name__)

DEFAULT_DATABASE = "neo4j"


class Neo4jClient:
    """Client kết nối và tương tác với cơ sở dữ liệu đồ thị Neo4j."""

    def __init__(
        self,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
        database: str | None = None,
    ):
        """
        Khởi tạo kết nối driver Neo4j.
        Mặc định đọc từ biến môi trường NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD,
        NEO4J_DATABASE.
        Tự động fallback giữa môi trường Docker (bolt://neo4j:7687) và Host (bolt://127.0.0.1:7687).
        """
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
        self.user = user or os.getenv("NEO4J_USER", "neo4j")
        self.password = password or os.getenv("NEO4J_PASSWORD", "")
        if not self.password:
            raise ValueError(
                "Thiếu mật khẩu Neo4j: hãy đặt biến môi trường NEO4J_PASSWORD "
                "(hoặc truyền password=... khi khởi tạo Neo4jClient). Xem .env.example."
            )
        self.requested_database = (database or os.getenv("NEO4J_DATABASE", DEFAULT_DATABASE) or DEFAULT_DATABASE).strip()
        self.database = self.requested_database

        self.driver = self._init_driver(self.uri)
        self._resolve_database()

    def _init_driver(self, uri: str) -> Driver:
        """Khởi tạo driver với cơ chế fallback tự động nếu host DNS không phân giải được."""
        try:
            drv = GraphDatabase.driver(uri, auth=(self.user, self.password))
            drv.verify_connectivity()
            return drv
        except Exception as e:
            # Nếu đang thử bolt://neo4j:7687 mà thất bại (do chạy ngoài Docker), thử fallback sang 127.0.0.1
            if "neo4j" in uri and not uri.startswith("bolt://127.0.0.1"):
                fallback_uri = "bolt://127.0.0.1:7687"
                logger.info(f"Kết nối tới {uri} thất bại. Thử fallback sang {fallback_uri}...")
                try:
                    drv = GraphDatabase.driver(fallback_uri, auth=(self.user, self.password))
                    drv.verify_connectivity()
                    self.uri = fallback_uri
                    return drv
                except Exception as ex:
                    logger.warning(f"Fallback sang {fallback_uri} cũng thất bại: {ex}")

            # Trả về driver chưa xác thực kết nối để caller tự kiểm tra qua verify_connection()
            logger.warning(f"Không thể xác thực kết nối Neo4j tại {uri}: {e}")
            return GraphDatabase.driver(uri, auth=(self.user, self.password))

    def _resolve_database(self) -> None:
        """
        Đảm bảo database mục tiêu tồn tại và có thể sử dụng.

        - Enterprise: chạy `CREATE DATABASE <tên> IF NOT EXISTS` qua session `system`
          nếu database chưa có, rồi kiểm tra lại bằng truy vấn RETURN 1.
        - Community (chỉ hỗ trợ database mặc định): tự động fallback về `neo4j`
          và cảnh báo để caller biết dữ liệu đang ghi vào database mặc định.
        """
        if self._probe_database(self.requested_database):
            self.database = self.requested_database
            return

        # Lệnh quản trị database không hỗ trợ tham số Cypher ($db) — phải nội
        # suy chuỗi sau khi kiểm tra tên bằng regex nghiêm ngặt.
        db_name = self.requested_database
        if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9._-]{2,62}", db_name) or db_name.lower() == "system":
            raise ValueError(f"Tên database Neo4j không hợp lệ: '{db_name}'")
        try:
            with self.driver.session(database="system") as session:
                session.run(f"CREATE DATABASE `{db_name}` IF NOT EXISTS").consume()
            logger.info(f"✅ Đã khởi tạo database Neo4j '{db_name}'.")
        except Neo4jError as e:
            logger.warning(
                f"Không thể tạo database '{db_name}' "
                f"(Neo4j Community chỉ hỗ trợ 1 database?): {e}"
            )

        if self._probe_database(self.requested_database):
            self.database = self.requested_database
            return

        if self.requested_database != DEFAULT_DATABASE:
            logger.warning(
                f"⚠️ Fallback database '{self.requested_database}' → '{DEFAULT_DATABASE}'. "
                "Dữ liệu dinh dưỡng vẫn cách ly nhờ label riêng, nhưng để cách ly "
                "hoàn toàn hãy dùng Neo4j Enterprise Edition."
            )
        self.database = DEFAULT_DATABASE

    def _probe_database(self, database: str) -> bool:
        """Kiểm tra nhanh database có tồn tại và truy vấn được hay không."""
        try:
            with self.driver.session(database=database) as session:
                session.run("RETURN 1").consume()
            return True
        except Exception:
            return False

    def ensure_database(self) -> str:
        """Public helper cho import script — trả về tên database đang được sử dụng."""
        return self.database

    def verify_connection(self) -> bool:
        """
        Kiểm tra trạng thái kết nối tới Neo4j server.
        Trả về True nếu kết nối thành công, False nếu thất bại.
        """
        try:
            self.driver.verify_connectivity()
            return True
        except Exception as e:
            logger.warning(f"Neo4j verify_connectivity failed: {e}")
            return False

    def execute_query(
        self, query: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Thực thi câu truy vấn Cypher trong session (database NEO4J_DATABASE) và trả về danh sách dict records."""
        with self.driver.session(database=self.database) as session:
            result = session.run(query, params or {})
            return [record.data() for record in result]

    def execute_write(
        self, query: str, params: dict[str, Any] | None = None
    ) -> Any:
        """Thực thi câu lệnh ghi (CREATE/MERGE/SET) trong transaction."""
        def _tx(tx):
            res = tx.run(query, params or {})
            return [record.data() for record in res]

        with self.driver.session(database=self.database) as session:
            return session.execute_write(_tx)

    def execute_write_batch(
        self,
        query_or_queries: str | list[Any],
        batch: list[dict[str, Any]] | None = None,
    ) -> Any:
        """
        Thực thi batch write trong transaction. Hỗ trợ cả 2 định dạng:
        1. client.execute_write_batch([(query1, params1), (query2, params2)])
        2. client.execute_write_batch(query_with_unwind, batch_list)
        """
        if batch is None and isinstance(query_or_queries, list):
            def _tx(tx):
                results = []
                for item in query_or_queries:
                    if isinstance(item, tuple) and len(item) == 2:
                        q, p = item
                        res = tx.run(q, p)
                    else:
                        res = tx.run(item)
                    results.append([r.data() for r in res])
                return results

            with self.driver.session(database=self.database) as session:
                return session.execute_write(_tx)

        def _tx_unwind(tx):
            res = tx.run(query_or_queries, {"batch": batch or []})
            return res.consume()

        with self.driver.session(database=self.database) as session:
            return session.execute_write(_tx_unwind)

    def close(self) -> None:
        """Đóng kết nối driver an toàn."""
        if self.driver:
            self.driver.close()

    def __enter__(self) -> Neo4jClient:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
