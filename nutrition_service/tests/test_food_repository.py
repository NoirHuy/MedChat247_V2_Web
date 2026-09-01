"""
tests/test_food_repository.py
Kiểm tra FoodRepository — lớp truy cập dữ liệu dinh dưỡng:
- Neo4jFoodRepository: Cypher đúng, map property chuẩn (dùng FakeDriver).
- CsvFoodRepository: hành vi tương thích ngược với logic pandas cũ.
- create_food_repository('auto'): fallback CSV khi Neo4j lỗi/trống.
"""

import pytest

import src.database.food_repository as fr_module
from src.database.food_repository import CsvFoodRepository, Neo4jFoodRepository
from src.services.consultant import create_food_repository


class FakeRecordSession:
    """Session giả trả về record data theo script."""

    def __init__(self, results: dict[str, list[dict]]):
        self._results = results
        self.database = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def run(self, query, params=None):
        self.last_query = query
        for key, rows in self._results.items():
            if key in query:
                self._current = rows
                break
        else:
            self._current = []
        return self

    def __iter__(self):
        return iter(self._current)


class FakeClient:
    """Giả Neo4jClient.execute_query — khớp query theo từ khóa."""

    def __init__(self, results: dict[str, list[dict]]):
        self.results = results
        self.queries: list[str] = []

    def execute_query(self, query, params=None):
        self.queries.append(query)
        for key, rows in self.results.items():
            if key in query:
                return rows
        return []

    def close(self):
        pass


def _fake_food_rows():
    return [
        {
            "food_id": "food_pho_bo",
            "food_name": "Phở bò",
            "food_name_normalized": "pho bo",
            "energy_kcal": 291.5,
            "protein_g": 16.1,
            "fat_g": 5.1,
            "carbohydrate_g": 45.3,
            "carb_g": 45.3,
            "fiber_g": 0.1,
            "sodium_mg": 1326.0,
            "potassium_mg": 218.0,
            "cholesterol_mg": 25.0,
            "purine_mg": None,
        },
        {
            "food_id": "food_com_hen",
            "food_name": "Cơm hến",
            "energy_kcal": 300.0,
            "protein_g": 10.0,
            "fat_g": 8.0,
            "carbohydrate_g": 50.0,
            "carb_g": 50.0,
            "sodium_mg": 900.0,
        },
    ]


def _fake_ingredient_rows():
    return [
        {
            "ingredient_id": "ing_ca_tram",
            "ingredient_name": "Cá trắm cỏ",
            "category": "thủy sản",
            "energy_kcal": 120.0,
            "protein_g": 22.0,
            "purine_mg": 160.0,
        }
    ]


class TestNeo4jFoodRepository:
    def test_get_dish_exact_match_cypher(self):
        client = FakeClient({"toLower(f.food_name)": _fake_food_rows()[:1]})
        repo = Neo4jFoodRepository(client)

        dish = repo.get_dish("Phở bò")
        assert dish is not None
        assert dish["food_name"] == "Phở bò"
        assert dish["protein_g"] == 16.1
        # Cypher không được dùng string concat trực tiếp (injection-safe)
        assert any("toLower(f.food_name) = toLower($name)" in q for q in client.queries)

    def test_get_dish_missing_returns_none(self):
        repo = Neo4jFoodRepository(FakeClient({}))
        assert repo.get_dish("món lạ") is None

    def test_substring_search_orders_by_name_length(self):
        client = FakeClient({"CONTAINS toLower($q)": _fake_food_rows()})
        repo = Neo4jFoodRepository(client)
        rows = repo.find_dishes_by_substring("phở")
        assert len(rows) == 2
        assert any("ORDER BY size(f.food_name) ASC" in q for q in client.queries)

    def test_nutrient_details_via_chua_rel(self):
        client = FakeClient({
            "CHUA": [
                {"nutrient_name": "Natri", "amount": 1326.0, "unit": "mg"},
                {"nutrient_name": "Kali", "amount": 218.0, "unit": "mg"},
            ]
        })
        repo = Neo4jFoodRepository(client)
        details = repo.get_nutrient_details("food_pho_bo")
        assert details[0]["nutrient_name"] == "Natri"
        assert any("CHUA" in q for q in client.queries)

    def test_name_indexes_for_matcher(self):
        client = FakeClient({
            "MATCH (f:Food) RETURN f.food_name": [{"name": "Phở bò"}],
            "MATCH (i:Ingredient) RETURN i.name": [{"name": "Cá trắm cỏ"}],
        })
        repo = Neo4jFoodRepository(client)
        assert repo.dish_names == [("phở bò", "Phở bò")]
        assert repo.ingredient_names == [("cá trắm cỏ", "Cá trắm cỏ")]

    def test_count_dishes(self):
        client = FakeClient({"count(*)": [{"c": 166}]})
        repo = Neo4jFoodRepository(client)
        assert repo.count_dishes() == 166
        assert repo.source == "neo4j"

    def test_ingredient_name_mapped_from_name_property(self):
        client = FakeClient({"toLower(i.name)": _fake_ingredient_rows()})
        repo = Neo4jFoodRepository(client)
        ing = repo.get_ingredient("cá trắm cỏ")
        assert ing["ingredient_name"] == "Cá trắm cỏ"
        assert ing["purine_mg"] == 160.0


@pytest.fixture(scope="module")
def csv_repo():
    import os

    processed = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "processed"
    )
    return CsvFoodRepository(
        dishes_path=os.path.join(processed, "food_nodes_cleaned.csv"),
        rels_path=os.path.join(processed, "food_nutrient_rels_cleaned.csv"),
        ingredients_path=os.path.join(processed, "vietnam_food_nutrition_cleaned.csv"),
    )


class TestCsvFoodRepository:
    def test_get_dish_exact(self, csv_repo):
        dish = csv_repo.get_dish("Phở bò tái 24h")
        assert dish is not None
        assert dish["food_id"] == "food_pho_bo_tai_24h"
        assert dish["sodium_mg"] == 1336.0

    def test_get_dish_case_insensitive(self, csv_repo):
        assert csv_repo.get_dish("phở bò tái 24h") is not None

    def test_substring_finds_normalized(self, csv_repo):
        rows = csv_repo.find_dishes_by_substring("pho bo")
        assert any("Phở bò" in (r.get("food_name") or "") for r in rows)

    def test_nutrient_details(self, csv_repo):
        details = csv_repo.get_nutrient_details("food_che_khuc_bach")
        assert len(details) > 0
        names = {d["nutrient_name"] for d in details}
        assert "Natri" in names

    def test_name_lists_match_df(self, csv_repo):
        names = csv_repo.dish_names
        assert len(names) == len(csv_repo.dishes_df)
        assert all(lower == orig.lower() for lower, orig in names)


class TestCreateRepositoryAuto:
    def test_auto_falls_back_to_csv_when_neo4j_unconfigured(self, monkeypatch):
        # Không có NEO4J_PASSWORD → Neo4jClient raise ValueError → CSV fallback
        monkeypatch.delenv("NEO4J_PASSWORD", raising=False)
        repo = create_food_repository(source="auto")
        assert repo.source == "csv"

    def test_forced_csv(self, monkeypatch):
        monkeypatch.delenv("NEO4J_PASSWORD", raising=False)
        repo = create_food_repository(source="csv")
        assert repo.source == "csv"

    def test_auto_uses_neo4j_when_graph_has_data(self, monkeypatch):
        """Neo4j có dữ liệu → được chọn làm nguồn chính."""
        monkeypatch.setenv("NEO4J_PASSWORD", "x")

        fake_repo = Neo4jFoodRepository(FakeClient({"count(*)": [{"c": 166}]}))
        monkeypatch.setattr(fr_module, "Neo4jClient", lambda: object(), raising=False)

        import src.services.consultant as consultant_module

        monkeypatch.setattr(consultant_module, "Neo4jClient", lambda: object())
        monkeypatch.setattr(consultant_module, "Neo4jFoodRepository", lambda client: fake_repo)

        repo = create_food_repository(source="auto")
        assert repo.source == "neo4j"

    def test_auto_falls_back_when_graph_empty(self, monkeypatch):
        """Neo4j kết nối được nhưng graph trống → CSV."""
        monkeypatch.setenv("NEO4J_PASSWORD", "x")

        empty_repo = Neo4jFoodRepository(FakeClient({}))
        import src.services.consultant as consultant_module

        monkeypatch.setattr(consultant_module, "Neo4jClient", lambda: object())
        monkeypatch.setattr(consultant_module, "Neo4jFoodRepository", lambda client: empty_repo)

        repo = create_food_repository(source="auto")
        assert repo.source == "csv"
