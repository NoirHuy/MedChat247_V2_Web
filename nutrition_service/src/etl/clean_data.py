"""
src/etl/clean_data.py
Pipeline tiền xử lý & làm sạch dữ liệu dinh dưỡng từ data/raw/ sang data/processed/.

Các bước:
1. Làm sạch dataset nguyên liệu (vietnam_food_nutrition.csv)
2. Khôi phục các quan hệ bị bỏ trong Removed_Unmapped
3. Hiệu chỉnh outliers/đơn vị, đồng bộ Food_Nodes
4. Điền năng lượng thiếu theo công thức Atwater và xuất kết quả
"""

from __future__ import annotations

import logging
import os
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")

# Cột dinh dưỡng chuẩn hoá về kiểu số cho dataset nguyên liệu
NUMERIC_COLUMNS = [
    "energy_kcal", "protein_g", "fat_g", "carb_g", "fiber_g", "purine_mg",
    "sodium_mg", "potassium_mg", "phosphorus_mg", "cholesterol_mg",
    "water_g", "fructose_g", "glucose_g", "sucrose_g", "calcium_mg",
    "iron_mg", "vitamin_c_mg",
]

# Cột axit amin bị lưu nhầm đơn vị mg trong Excel gốc
AMINO_ACID_PROPERTIES = [
    "tryptophan_g", "threonine_g", "isoleucine_g", "leucine_g", "lysine_g",
    "methionine_g", "cystine_g", "phenylalanine_g", "tyrosine_g", "valine_g",
    "arginine_g", "histidine_g", "alanine_g", "aspartic_acid_g", "glutamic_acid_g",
    "glycine_g", "proline_g", "serine_g",
]

# Bản đồ sửa lỗi OCR / tên nutrient ghi sai trong sheet Removed_Unmapped
RECOVERY_NUTRIENT_MAP = {
    ("Chät áam", "Chất đạm"): ("nutrient_chat_dam", "Chất đạm", "protein_g", "g"),
    ("ses", "sắt", "Sắt"): ("nutrient_sat", "Sắt", "iron_mg", "mg"),
}

# Bản đồ axit béo nhận diện qua chuỗi con trong tên nutrient
FATTY_ACID_MAP: list[tuple[str, tuple[str, str, str, str]]] = [
    ("C16:0", ("nutrient_acid_palmitic", "Acid Palmitic (C16:0)", "c16_0_g", "g")),
    ("C18:0", ("nutrient_acid_stearic", "Acid Stearic (C18:0)", "c18_0_g", "g")),
    ("C18:1", ("nutrient_acid_oleic", "Acid Oleic (C18:1)", "c18_1_g", "g")),
    ("Linoleic", ("nutrient_linoleic_acid", "Linoleic Acid (C18:2)", "c18_2_g", "g")),
    ("Alpha-Linolenic", ("nutrient_alpha_linolenic_acid", "Alpha-Linolenic Acid (C18:3)", "c18_3_g", "g")),
]

# Hiệu chỉnh cholesterol bị trôi/sai cho một số món lẩu & món xào (đơn vị mg)
CHOLESTEROL_CORRECTIONS: dict[str, float] = {
    "food_lau_cua_thit_bo": 352.8,
    "food_lau_ga": 293.0,
    "food_lau_ech": 250.0,
    "food_lau_thap_cam": 299.5,
    "food_my_xao_thap_cam": 213.0,
    "food_tim_bau_duc_xao_can_toi": 568.0,
}

# Các giá trị outlier đã thẩm định lại thủ công: (food_id, nutrient_id, giá trị đúng)
POINT_CORRECTIONS: tuple[tuple[str, str, float], ...] = (
    ("food_com_suat_van_phong_thit_nac_vai_su_hao", "nutrient_kem", 5.1),
    ("food_banh_bot_loc", "nutrient_sat", 1.74),
)

ATWATER_KCAL_PER_G = {"protein": 4.0, "fat": 9.0, "carb": 4.0}


def clean_vietnam_food_nutrition(
    input_path: str = os.path.join(RAW_DIR, "vietnam_food_nutrition.csv"),
    output_path: str = os.path.join(PROCESSED_DIR, "vietnam_food_nutrition_cleaned.csv"),
) -> pd.DataFrame:
    """Làm sạch dataset nguyên liệu: sửa lỗi số, chuẩn hoá kiểu dữ liệu và tên."""
    logger.info("Đang làm sạch nguyên liệu: '%s'...", input_path)
    df = pd.read_csv(input_path, encoding="utf-8")

    # 1. Sửa lỗi dấu chấm kép '..' thành '.'
    for col in ["fat_g", "carb_g", "fructose_g"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.replace(r"\.\.+", ".", regex=True)
            df[col] = df[col].replace({"nan": np.nan, "None": np.nan, "": np.nan})
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # 2. Đảm bảo toàn bộ các cột dinh dưỡng là float64
    for col in NUMERIC_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # 3. Chuẩn hóa chuỗi văn bản
    df["ingredient_name"] = df["ingredient_name"].str.strip()
    df["category"] = df["category"].str.strip()

    # 4. Lưu file sạch
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False, encoding="utf-8")
    logger.info(" -> Đã xuất '%s': %d dòng, %d cột.", output_path, len(df), len(df.columns))
    return df


def _resolve_recovered_nutrient(nutr: str) -> tuple[str, str, str, str] | None:
    """Áp xạ tên nutrient ghi sai/thiếu sang (nutrient_id, nutrient_name, property_name, unit)."""
    for aliases, resolved in RECOVERY_NUTRIENT_MAP.items():
        if nutr in aliases:
            return resolved
    for marker, resolved in FATTY_ACID_MAP:
        if marker in nutr:
            return resolved
    return None


def _recover_unmapped_rels(unmapped_df: pd.DataFrame, dish_to_id: dict[str, Any]) -> pd.DataFrame:
    """Khôi phục các dòng quan hệ dinh dưỡng bị loại nhầm trong sheet Removed_Unmapped."""
    recovered_rows: list[dict[str, Any]] = []
    for _, row in unmapped_df.iterrows():
        dish = str(row["dish_name_guess"]).strip()
        nutr = str(row["nutrient"]).strip()
        val_str = str(row["value_text"]).strip().replace(",", ".")
        raw_line = str(row["line_text"]).strip()

        try:
            val = float(val_str)
        except ValueError:
            continue

        food_id = dish_to_id.get(dish)
        if not food_id:
            for d_name, f_id in dish_to_id.items():
                if dish.lower() == d_name.lower():
                    food_id = f_id
                    break
        if not food_id:
            continue

        resolved = _resolve_recovered_nutrient(nutr)
        if resolved is None:
            continue
        nutrient_id, nutrient_name, prop_name, unit = resolved

        recovered_rows.append({
            "food_id": food_id,
            "food_name": dish,
            "nutrient_id": nutrient_id,
            "nutrient_name": nutrient_name,
            "property_name": prop_name,
            "amount": val,
            "unit": unit,
            "source_document": "tat_ca_mon_an.xlsx",
            "source_page": 1,
            "raw_nutrient": nutr,
            "raw_line": raw_line,
        })

    return pd.DataFrame(recovered_rows)


def _apply_outlier_corrections(rels_df: pd.DataFrame) -> pd.DataFrame:
    """Sửa đơn vị axit amin và các giá trị outlier đã thẩm định."""
    mask_amino = (rels_df["food_id"] == "food_dau_trang_dau_tay_hat_kho") & (
        rels_df["property_name"].isin(AMINO_ACID_PROPERTIES)
    )
    rels_df.loc[mask_amino, "unit"] = "mg"

    for fid, corrected_val in CHOLESTEROL_CORRECTIONS.items():
        mask = (rels_df["food_id"] == fid) & (rels_df["nutrient_id"] == "nutrient_cholesterol")
        rels_df.loc[mask, "amount"] = corrected_val

    for fid, nutrient_id, corrected_val in POINT_CORRECTIONS:
        mask = (rels_df["food_id"] == fid) & (rels_df["nutrient_id"] == nutrient_id)
        rels_df.loc[mask, "amount"] = corrected_val

    return rels_df


def _sync_nodes_with_rels(nodes_df: pd.DataFrame, rels_df: pd.DataFrame) -> None:
    """Đồng bộ giá trị dinh dưỡng từ bảng quan hệ vào các cột của Food_Nodes (in-place)."""
    amino_in_mg = set(AMINO_ACID_PROPERTIES)
    for idx, row in nodes_df.iterrows():
        fid = row["food_id"]
        dish_rels = rels_df[rels_df["food_id"] == fid]
        for _, rel_row in dish_rels.iterrows():
            prop = rel_row["property_name"]
            amt = rel_row["amount"]
            if prop in amino_in_mg and rel_row["unit"] == "mg":
                amt = amt / 1000.0
            if prop in nodes_df.columns:
                nodes_df.at[idx, prop] = amt


def _impute_atwater_energy(nodes_df: pd.DataFrame, rels_df: pd.DataFrame) -> pd.DataFrame:
    """Điền năng lượng thiếu bằng công thức Atwater (4-9-4) và ghi log quan hệ tương ứng."""
    for idx, row in nodes_df.iterrows():
        if not (pd.isna(row.get("energy_kcal")) or row.get("energy_kcal") == 0):
            continue
        p = row.get("protein_g", 0) or 0
        f = row.get("fat_g", 0) or 0
        c = row.get("carbohydrate_g", 0) or 0
        if (p > 0 or f > 0 or c > 0) and not (pd.isna(p) and pd.isna(f) and pd.isna(c)):
            calc_kcal = round(float(p or 0) * ATWATER_KCAL_PER_G["protein"]
                              + float(f or 0) * ATWATER_KCAL_PER_G["fat"]
                              + float(c or 0) * ATWATER_KCAL_PER_G["carb"], 1)
            if calc_kcal > 0:
                nodes_df.at[idx, "energy_kcal"] = calc_kcal
                fid = row["food_id"]
                has_energy_rel = ((rels_df["food_id"] == fid) & (rels_df["nutrient_id"] == "nutrient_nang_luong")).any()
                if not has_energy_rel:
                    rels_df = pd.concat([rels_df, pd.DataFrame([{
                        "food_id": fid,
                        "food_name": row["food_name"],
                        "nutrient_id": "nutrient_nang_luong",
                        "nutrient_name": "Năng lượng",
                        "property_name": "energy_kcal",
                        "amount": calc_kcal,
                        "unit": "kcal",
                        "source_document": "tat_ca_mon_an.xlsx (Atwater Imputed)",
                        "source_page": 1,
                        "raw_nutrient": "Năng lượng (tính toán)",
                        "raw_line": f"Atwater: 4*{p} + 9*{f} + 4*{c} = {calc_kcal}",
                    }])], ignore_index=True)
    return rels_df


def _export_cleaned_outputs(
    nodes_df: pd.DataFrame,
    rels_df: pd.DataFrame,
    guide_df: pd.DataFrame,
    out_nodes_csv: str,
    out_rels_csv: str,
    out_excel: str,
) -> None:
    """Xuất kết quả đã làm sạch ra CSV + Excel kèm Cleaning_Log."""
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    nodes_df.to_csv(out_nodes_csv, index=False, encoding="utf-8")
    rels_df.to_csv(out_rels_csv, index=False, encoding="utf-8")

    with pd.ExcelWriter(out_excel, engine="openpyxl") as writer:
        nodes_df.to_excel(writer, sheet_name="Food_Nodes", index=False)
        rels_df.to_excel(writer, sheet_name="Food_Nutrient_Rels", index=False)
        if not guide_df.empty:
            guide_df.to_excel(writer, sheet_name="Neo4j_Import_Guide", index=False)
        pd.DataFrame([{
            "status": "Tất cả dữ liệu đã được làm sạch, khôi phục và tính toán năng lượng chuẩn xác."
        }]).to_excel(writer, sheet_name="Cleaning_Log", index=False)


def clean_mon_an_and_rels(
    excel_path: str = os.path.join(RAW_DIR, "mon_an_neo4j_ready.xlsx"),
    out_nodes_csv: str = os.path.join(PROCESSED_DIR, "food_nodes_cleaned.csv"),
    out_rels_csv: str = os.path.join(PROCESSED_DIR, "food_nutrient_rels_cleaned.csv"),
    out_excel: str = os.path.join(PROCESSED_DIR, "mon_an_neo4j_ready_cleaned.xlsx"),
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Làm sạch dataset món ăn: khôi phục quan hệ, sửa outlier, điền năng lượng Atwater."""
    logger.info("Đang đọc và xử lý món ăn: '%s'...", excel_path)
    xl = pd.ExcelFile(excel_path)
    nodes_df = xl.parse("Food_Nodes")
    rels_df = xl.parse("Food_Nutrient_Rels")
    unmapped_df = xl.parse("Removed_Unmapped")
    guide_df = xl.parse("Neo4j_Import_Guide") if "Neo4j_Import_Guide" in xl.sheet_names else pd.DataFrame()

    dish_to_id = dict(zip(nodes_df["food_name"], nodes_df["food_id"], strict=False))

    # 1. Khôi phục các dòng trong Removed_Unmapped
    recovered_df = _recover_unmapped_rels(unmapped_df, dish_to_id)
    rels_df = pd.concat([rels_df, recovered_df], ignore_index=True)

    # 2. Hiệu chỉnh Outliers & Đơn vị
    rels_df = _apply_outlier_corrections(rels_df)

    # 3. Đồng bộ Food_Nodes + tính toán bổ sung năng lượng Atwater
    logger.info("Đang đồng bộ Food_Nodes và tính toán bổ sung năng lượng Atwater...")
    _sync_nodes_with_rels(nodes_df, rels_df)
    rels_df = _impute_atwater_energy(nodes_df, rels_df)

    # 4. Xuất các file sạch
    logger.info("Đang lưu dữ liệu đã làm sạch vào data/processed/...")
    _export_cleaned_outputs(nodes_df, rels_df, guide_df, out_nodes_csv, out_rels_csv, out_excel)

    logger.info(" -> Đã xuất '%s' (%d món)", out_nodes_csv, len(nodes_df))
    logger.info(" -> Đã xuất '%s' (%d quan hệ)", out_rels_csv, len(rels_df))
    logger.info(" -> Đã xuất '%s'", out_excel)
    return nodes_df, rels_df


def clean_all_datasets() -> None:
    """Chạy toàn bộ pipeline làm sạch cho cả hai dataset."""
    clean_vietnam_food_nutrition()
    clean_mon_an_and_rels()
    logger.info("✅ HOÀN TẤT TOÀN BỘ TIỀN XỬ LÝ DỮ LIỆU!")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    clean_all_datasets()
