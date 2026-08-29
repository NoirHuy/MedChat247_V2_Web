"""
src/database/import_data.py
Nạp dữ liệu dinh dưỡng đã làm sạch (data/processed) vào Neo4j Knowledge Graph.
Ngưỡng cảnh báo lâm sàng đọc từ src/core/constants.py (nguồn chân lý duy nhất).
"""

from __future__ import annotations

import logging

from src.core.constants import CHRONIC_CONDITIONS, GRAPH_WARNING_THRESHOLDS, LEGACY_CONDITION_ALIASES
from src.database.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)


def run_import() -> bool:
    """Thực hiện toàn bộ quy trình nạp dữ liệu vào Neo4j. Trả về True nếu thành công."""
    client = Neo4jClient()
    if not client.verify_connection():
        logger.error("❌ Không thể kết nối tới Neo4j. Hãy kiểm tra container Docker!")
        return False

    logger.info(
        f"🎯 Database mục tiêu: '{client.ensure_database()}' "
        f"(NEO4J_DATABASE='{client.requested_database}')"
    )
    logger.info("🚀 Bắt đầu quá trình nạp dữ liệu vào Neo4j Knowledge Graph...")

    # 1. Ràng buộc duy nhất (Constraints)
    constraints = [
        "CREATE CONSTRAINT IF NOT EXISTS FOR (f:Food) REQUIRE f.food_id IS UNIQUE;",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (i:Ingredient) REQUIRE i.ingredient_id IS UNIQUE;",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Nutrient) REQUIRE n.nutrient_id IS UNIQUE;",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (c:ChronicCondition) REQUIRE c.condition_id IS UNIQUE;",
    ]
    for constraint in constraints:
        client.execute_query(constraint)
    logger.info("✅ Đã tạo các Constraints.")

    # 2. Khởi tạo các nhóm bệnh mạn tính (từ constants — không còn danh sách cứng lặp lại)
    condition_entries = [
        {"id": cond_id, "name": info["name_vi"]}
        for cond_id, info in CHRONIC_CONDITIONS.items()
        if cond_id not in LEGACY_CONDITION_ALIASES  # bỏ mã legacy 'CKD'
    ]
    conditions_cypher = """
    UNWIND $conditions AS cond
    MERGE (c:ChronicCondition {condition_id: cond.id})
    SET c.name = cond.name;
    """
    client.execute_query(conditions_cypher, {"conditions": condition_entries})
    logger.info(f"✅ Đã nạp {len(condition_entries)} nhóm Bệnh mạn tính.")

    # 3. Nạp Food Nodes
    food_cypher = """
    LOAD CSV WITH HEADERS FROM 'file:///food_nodes_cleaned.csv' AS row
    MERGE (f:Food {food_id: row.food_id})
    SET f.name = row.food_name,
        f.food_name = row.food_name,
        f.food_type = row.food_type,
        f.energy_kcal = toFloat(row.energy_kcal),
        f.protein_g = toFloat(row.protein_g),
        f.fat_g = toFloat(row.fat_g),
        f.carb_g = toFloat(row.carbohydrate_g),
        f.carbohydrate_g = toFloat(row.carbohydrate_g),
        f.fiber_g = toFloat(row.fiber_g),
        f.sodium_mg = toFloat(row.sodium_mg),
        f.potassium_mg = toFloat(row.potassium_mg),
        f.cholesterol_mg = toFloat(row.cholesterol_mg);
    """
    client.execute_query(food_cypher)
    logger.info("✅ Đã nạp danh mục Món ăn (Food).")

    # 4. Nạp Ingredient Nodes
    ing_cypher = """
    LOAD CSV WITH HEADERS FROM 'file:///vietnam_food_nutrition_cleaned.csv' AS row
    MERGE (i:Ingredient {ingredient_id: row.ingredient_id})
    SET i.name = row.ingredient_name,
        i.category = row.category,
        i.energy_kcal = toFloat(row.energy_kcal),
        i.protein_g = toFloat(row.protein_g),
        i.fat_g = toFloat(row.fat_g),
        i.carb_g = toFloat(row.carb_g),
        i.fiber_g = toFloat(row.fiber_g),
        i.purine_mg = toFloat(row.purine_mg),
        i.sodium_mg = toFloat(row.sodium_mg),
        i.potassium_mg = toFloat(row.potassium_mg),
        i.phosphorus_mg = toFloat(row.phosphorus_mg),
        i.cholesterol_mg = toFloat(row.cholesterol_mg);
    """
    client.execute_query(ing_cypher)
    logger.info("✅ Đã nạp danh mục Nguyên liệu (Ingredient).")

    # 5. Nạp Quan hệ Dinh dưỡng (Food)-[:CHUA]->(Nutrient)
    rels_cypher = """
    LOAD CSV WITH HEADERS FROM 'file:///food_nutrient_rels_cleaned.csv' AS row
    MATCH (f:Food {food_id: row.food_id})
    MERGE (n:Nutrient {nutrient_id: row.nutrient_id})
    SET n.name = row.nutrient_name,
        n.unit = row.unit
    MERGE (f)-[r:CHUA]->(n)
    SET r.amount = toFloat(row.amount);
    """
    client.execute_query(rels_cypher)
    logger.info("✅ Đã nạp quan hệ (Food)-[:CHUA]->(Nutrient).")

    # 6. Tạo các liên kết cảnh báo lâm sàng tự động (ngưỡng từ constants chung)
    sodium_warn = GRAPH_WARNING_THRESHOLDS["FOOD_SODIUM"]
    cholesterol_warn = GRAPH_WARNING_THRESHOLDS["FOOD_CHOLESTEROL"]
    purine_warn = GRAPH_WARNING_THRESHOLDS["INGREDIENT_PURINE"]

    clinical_edges = [
        # Natri cao cảnh báo Tăng huyết áp & Thận chưa lọc máu
        (
            """
            MATCH (f:Food), (c:ChronicCondition)
            WHERE f.sodium_mg >= $sodium AND c.condition_id IN ['HYPERTENSION', 'CKD_NON_DIALYSIS']
            MERGE (f)-[r:CANH_BAO_CHO]->(c)
            SET r.reason = 'Hàm lượng Natri rất cao, gây giữ muối nước và tăng gánh nặng tim thận.';
            """,
            {"sodium": sodium_warn},
        ),
        # Cholesterol cao cảnh báo Rối loạn mỡ máu
        (
            """
            MATCH (f:Food), (c:ChronicCondition {condition_id: 'DYSLIPIDEMIA'})
            WHERE f.cholesterol_mg >= $chol
            MERGE (f)-[r:CANH_BAO_CHO]->(c)
            SET r.reason = 'Hàm lượng Cholesterol cao, tăng nguy cơ xơ vữa.';
            """,
            {"chol": cholesterol_warn},
        ),
        # Purine cao trong nguyên liệu cảnh báo Gout
        (
            """
            MATCH (i:Ingredient), (c:ChronicCondition {condition_id: 'GOUT'})
            WHERE i.purine_mg >= $purine
            MERGE (i)-[r:CANH_BAO_CHO]->(c)
            SET r.reason = 'Nhóm thực phẩm giàu nhân Purine, có thể kích hoạt cơn Gout cấp.';
            """,
            {"purine": purine_warn},
        ),
    ]
    for edge_query, params in clinical_edges:
        client.execute_query(edge_query, params)
    logger.info("✅ Đã tạo các cạnh cảnh báo bệnh lâm sàng [:CANH_BAO_CHO].")

    client.close()
    logger.info("🎉 Hoàn tất nạp dữ liệu vào Neo4j Knowledge Graph!")
    return True


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    run_import()
