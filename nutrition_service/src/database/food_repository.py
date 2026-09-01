"""
src/database/food_repository.py
Lớp truy cập dữ liệu dinh dưỡng — Neo4j là nguồn chính (Cypher), CSV là fallback.

Cả hai implementation cùng "duck-type" interface FoodRepository:
    source            : 'neo4j' | 'csv' (observability)
    dish_names        : list[(lower, original)] — index cho FoodMatcher
    ingredient_names  : list[(lower, original)]
    get_dish(name)               -> dict | None    (exact, case-insensitive)
    find_dishes_by_substring(q)  -> list[dict]
    get_ingredient(name)         -> dict | None
    find_ingredients_by_substring(q) -> list[dict]
    get_nutrient_details(food_id)-> list[dict]    (nutrient_name, amount, unit)
    all_dishes()                 -> list[dict]    (đề xuất món thay thế)
    all_ingredients()            -> list[dict]    (autocomplete)
    count_dishes()               -> int           (kiểm tra graph có dữ liệu)
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

from src.database.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

__all__ = [
    "CsvFoodRepository",
    "Neo4jFoodRepository",
]


def _to_native(val: Any) -> Any:
    """Quy đổi numpy/pandas types sang native types (bản sao cục bộ để tránh
    import vòng: food_matcher ← services/__init__ ← consultant ← food_repository)."""
    if pd.isna(val) or val is None:
        return None
    # bool phải xử lý trước int (isinstance(True, int) == True trong Python)
    if isinstance(val, (bool, np.bool_)):
        return bool(val)
    if isinstance(val, (np.integer, int)):
        return int(val)
    if isinstance(val, (np.floating, float)):
        return float(val)
    return val


# Props của Food/Ingredient trả về cho rules engine & consultant —
# giữ đúng tên cột như CSV cũ để ChronicDiseaseEvaluator hoạt động không đổi.
_FOOD_PROPS = [
    "food_id",
    "food_name",
    "energy_kcal",
    "protein_g",
    "fat_g",
    "carbohydrate_g",
    "carb_g",
    "fiber_g",
    "sodium_mg",
    "potassium_mg",
    "cholesterol_mg",
    "purine_mg",
]
_INGREDIENT_PROPS = [
    "ingredient_id",
    "ingredient_name",
    "category",
    "energy_kcal",
    "protein_g",
    "fat_g",
    "carb_g",
    "fiber_g",
    "purine_mg",
    "sodium_mg",
    "potassium_mg",
    "phosphorus_mg",
    "cholesterol_mg",
]


def _clean_row(row: dict[str, Any]) -> dict[str, Any]:
    return {k: _to_native(v) for k, v in row.items() if v is not None}


class Neo4jFoodRepository:
    """Đọc toàn bộ dữ liệu dinh dưỡng từ Neo4j bằng Cypher (nguồn chính)."""

    source = "neo4j"

    def __init__(self, client: Neo4jClient):
        self.client = client

    # ── Query builders ────────────────────────────────────────────────────────

    @staticmethod
    def _food_return() -> str:
        return ", ".join(f"f.{p} AS {p}" for p in _FOOD_PROPS)

    @staticmethod
    def _ingredient_return() -> str:
        # Ingredient node lưu tên ở property `name` — map sang ingredient_name
        # để tương thích với schema CSV cũ mà rules engine đang dùng.
        parts = []
        for p in _INGREDIENT_PROPS:
            if p == "ingredient_name":
                parts.append("i.name AS ingredient_name")
            else:
                parts.append(f"i.{p} AS {p}")
        return ", ".join(parts)

    # ── Read API ─────────────────────────────────────────────────────────────

    def get_dish(self, name: str) -> dict[str, Any] | None:
        rows = self.client.execute_query(
            f"MATCH (f:Food) WHERE toLower(f.food_name) = toLower($name) "
            f"RETURN {self._food_return()} LIMIT 1",
            {"name": str(name).strip()},
        )
        return _clean_row(rows[0]) if rows else None

    def find_dishes_by_substring(self, q: str) -> list[dict[str, Any]]:
        rows = self.client.execute_query(
            f"MATCH (f:Food) WHERE toLower(f.food_name) CONTAINS toLower($q) "
            f"   OR toLower(coalesce(f.food_name_normalized, '')) CONTAINS toLower($q) "
            f"RETURN {self._food_return()} ORDER BY size(f.food_name) ASC LIMIT 25",
            {"q": str(q).strip()},
        )
        return [_clean_row(r) for r in rows]

    def get_ingredient(self, name: str) -> dict[str, Any] | None:
        rows = self.client.execute_query(
            f"MATCH (i:Ingredient) WHERE toLower(i.name) = toLower($name) "
            f"RETURN {self._ingredient_return()} LIMIT 1",
            {"name": str(name).strip()},
        )
        return _clean_row(rows[0]) if rows else None

    def find_ingredients_by_substring(self, q: str) -> list[dict[str, Any]]:
        rows = self.client.execute_query(
            f"MATCH (i:Ingredient) WHERE toLower(i.name) CONTAINS toLower($q) "
            f"RETURN {self._ingredient_return()} ORDER BY size(i.name) ASC LIMIT 25",
            {"q": str(q).strip()},
        )
        return [_clean_row(r) for r in rows]

    def get_nutrient_details(self, food_id: str) -> list[dict[str, Any]]:
        rows = self.client.execute_query(
            "MATCH (:Food {food_id: $fid})-[r:CHUA]->(n:Nutrient) "
            "RETURN n.name AS nutrient_name, r.amount AS amount, n.unit AS unit "
            "ORDER BY n.name ASC",
            {"fid": food_id},
        )
        return [_clean_row(r) for r in rows]

    def all_dishes(self) -> list[dict[str, Any]]:
        rows = self.client.execute_query(
            f"MATCH (f:Food) RETURN {self._food_return()} ORDER BY f.food_name ASC"
        )
        return [_clean_row(r) for r in rows]

    def all_ingredients(self) -> list[dict[str, Any]]:
        rows = self.client.execute_query(
            f"MATCH (i:Ingredient) RETURN {self._ingredient_return()} ORDER BY i.name ASC"
        )
        return [_clean_row(r) for r in rows]

    def count_dishes(self) -> int:
        rows = self.client.execute_query("MATCH (f:Food) RETURN count(*) AS c")
        return int(rows[0]["c"]) if rows else 0

    # ── Name indexes cho FoodMatcher ─────────────────────────────────────────

    @property
    def dish_names(self) -> list[tuple[str, str]]:
        rows = self.client.execute_query("MATCH (f:Food) RETURN f.food_name AS name")
        return [(str(r["name"]).lower(), str(r["name"])) for r in rows if r.get("name")]

    @property
    def ingredient_names(self) -> list[tuple[str, str]]:
        rows = self.client.execute_query("MATCH (i:Ingredient) RETURN i.name AS name")
        return [(str(r["name"]).lower(), str(r["name"])) for r in rows if r.get("name")]


class CsvFoodRepository:
    """Fallback: đọc từ các file CSV đã làm sạch (data/processed) qua pandas."""

    source = "csv"

    def __init__(
        self,
        dishes_path: str,
        rels_path: str,
        ingredients_path: str,
    ):
        self.dishes_df = pd.read_csv(dishes_path, encoding="utf-8")
        self.rels_df = pd.read_csv(rels_path, encoding="utf-8")
        self.ingredients_df = pd.read_csv(ingredients_path, encoding="utf-8")

        self._dish_names_lower = self.dishes_df["food_name"].str.lower()
        self._ingredient_names_lower = self.ingredients_df["ingredient_name"].str.lower()

    # ── Helper: Series → dict native (NaN → None) ────────────────────────────

    @staticmethod
    def _series_to_dict(row: Any) -> dict[str, Any]:
        return {k: _to_native(v) for k, v in row.to_dict().items()}

    # ── Read API ─────────────────────────────────────────────────────────────

    def get_dish(self, name: str) -> dict[str, Any] | None:
        q = str(name).strip().lower()
        matched = self.dishes_df[self._dish_names_lower == q]
        return self._series_to_dict(matched.iloc[0]) if not matched.empty else None

    def find_dishes_by_substring(self, q: str) -> list[dict[str, Any]]:
        matched = self.dishes_df[
            self.dishes_df["food_name"].str.contains(q, case=False, na=False, regex=False)
            | self.dishes_df["food_name_normalized"].str.contains(q, case=False, na=False, regex=False)
        ]
        return [self._series_to_dict(r) for _, r in matched.iterrows()]

    def get_ingredient(self, name: str) -> dict[str, Any] | None:
        q = str(name).strip().lower()
        matched = self.ingredients_df[self._ingredient_names_lower == q]
        return self._series_to_dict(matched.iloc[0]) if not matched.empty else None

    def find_ingredients_by_substring(self, q: str) -> list[dict[str, Any]]:
        matched = self.ingredients_df[
            self.ingredients_df["ingredient_name"].str.contains(q, case=False, na=False, regex=False)
        ]
        return [self._series_to_dict(r) for _, r in matched.iterrows()]

    def get_nutrient_details(self, food_id: str) -> list[dict[str, Any]]:
        nutrients = self.rels_df[self.rels_df["food_id"] == food_id][
            ["nutrient_name", "amount", "unit"]
        ]
        return [
            {"nutrient_name": r["nutrient_name"], "amount": _to_native(r["amount"]), "unit": r["unit"]}
            for _, r in nutrients.iterrows()
        ]

    def all_dishes(self) -> list[dict[str, Any]]:
        return [self._series_to_dict(r) for _, r in self.dishes_df.iterrows()]

    def all_ingredients(self) -> list[dict[str, Any]]:
        return [self._series_to_dict(r) for _, r in self.ingredients_df.iterrows()]

    def count_dishes(self) -> int:
        return len(self.dishes_df)

    # ── Name indexes cho FoodMatcher ─────────────────────────────────────────

    @property
    def dish_names(self) -> list[tuple[str, str]]:
        return [
            (str(n).lower(), str(n)) for n in self.dishes_df["food_name"].dropna()
        ]

    @property
    def ingredient_names(self) -> list[tuple[str, str]]:
        return [
            (str(n).lower(), str(n)) for n in self.ingredients_df["ingredient_name"].dropna()
        ]
