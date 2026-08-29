"""
tests/test_neo4j_client_multidb.py
Kiểm tra cơ chế Multi-Database Isolation của Neo4jClient (không cần Neo4j thật):
- Enterprise: tự CREATE DATABASE nếu chưa có, session chạy trên database mục tiêu.
- Community (chỉ 1 database): tự fallback về database mặc định `neo4j`.
- Tên database không hợp lệ phải bị từ chối.
"""

import re

import pytest
from neo4j.exceptions import Neo4jError

import src.database.neo4j_client as neo4j_client_module
from src.database.neo4j_client import Neo4jClient


class FakeResult:
    def __init__(self, action=None):
        self._action = action

    def consume(self):
        if self._action:
            self._action()

    def __iter__(self):
        return iter([])


class FakeSession:
    def __init__(self, driver, database):
        self._driver = driver
        self.database = database

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def run(self, query, params=None):
        if self.database == "system":
            if not self._driver.enterprise:
                raise Neo4jError("Unsupported administration command (Community Edition)")
            assert query.startswith("CREATE DATABASE `")
            self._driver.created_databases.append(query)
            match = re.match(r"CREATE DATABASE `([^`]+)`", query)
            if match:
                self._driver.existing_databases.add(match.group(1))
            return FakeResult()
        if self.database in self._driver.existing_databases:
            return FakeResult()
        raise Neo4jError(f"Database does not exist: {self.database}")


class FakeDriver:
    def __init__(self, enterprise=True):
        self.enterprise = enterprise
        self.existing_databases = {"neo4j", "system"}
        self.created_databases = []

    def verify_connectivity(self):
        return True

    def session(self, database=None):
        return FakeSession(self, database)

    def close(self):
        pass


class FakeGraphDatabase:
    def __init__(self, driver):
        self._driver = driver

    def driver(self, uri, auth=None):
        return self._driver


@pytest.fixture
def patch_driver(monkeypatch):
    def _patch(enterprise=True):
        fake = FakeDriver(enterprise=enterprise)
        monkeypatch.setattr(
            neo4j_client_module, "GraphDatabase", FakeGraphDatabase(fake)
        )
        return fake

    return _patch


def test_enterprise_creates_and_targets_nutrition_database(patch_driver):
    fake = patch_driver(enterprise=True)
    client = Neo4jClient(uri="bolt://127.0.0.1:7687", password="x", database="nutrition")

    assert client.database == "nutrition"
    assert client.ensure_database() == "nutrition"
    assert any("CREATE DATABASE `nutrition`" in q for q in fake.created_databases)


def test_existing_nutrition_database_skips_creation(patch_driver):
    fake = patch_driver(enterprise=True)
    fake.existing_databases.add("nutrition")
    client = Neo4jClient(uri="bolt://127.0.0.1:7687", password="x", database="nutrition")

    assert client.database == "nutrition"
    assert fake.created_databases == []


def test_community_edition_falls_back_to_default_database(patch_driver):
    patch_driver(enterprise=False)
    client = Neo4jClient(uri="bolt://127.0.0.1:7687", password="x", database="nutrition")

    assert client.database == "neo4j"


def test_invalid_database_name_is_rejected(patch_driver):
    patch_driver(enterprise=True)
    with pytest.raises(ValueError):
        Neo4jClient(
            uri="bolt://127.0.0.1:7687",
            password="x",
            database="nutrition; DROP DATABASE system",
        )


def test_sessions_execute_on_resolved_database(patch_driver):
    fake = patch_driver(enterprise=True)
    fake.existing_databases.add("nutrition")
    client = Neo4jClient(uri="bolt://127.0.0.1:7687", password="x", database="nutrition")

    rows = client.execute_query("RETURN 1 AS one")
    assert rows == []
