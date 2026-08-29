# 🥗 Nutrition Service — Tư vấn Dinh dưỡng Bệnh Mạn Tính

Python Flask microservice (port nội bộ **5000**) được tích hợp vào medchat_web theo mô hình
**Monorepo + Node.js API Gateway**. Được sao chép từ `ModuleDinhDuong` và giữ nguyên toàn bộ
logic: rules lâm sàng, matcher món ăn tiếng Việt 3 tầng, engine tư vấn + LLM fallback.

## Kiến trúc

```
Browser → Node back_end (:4000)  /api/chat  (specialtyId = 'nutrition_consultation')
              │  forward {message, conditions}  (auth + quota + rate-limit + SystemLog giữ nguyên)
              ▼
        Flask Nutrition (:5000) /api/chat  →  { reply_text, structured_data }
              │
              ▼
        Neo4j database `nutrition` (cách ly với database `neo4j` của GraphRAG y khoa)
```

- Node back_end bọc `structured_data` thành marker `__NUTRITION_DATA__:{json}` trong stream.
- Frontend `MessageBubble` parse marker và render `NutritionCard`.
- Service **không expose port ra internet** trong production — Node là cổng vào duy nhất.

## Cách ly dữ liệu Neo4j (Multi-Database)

- Biến `NEO4J_DATABASE` (mặc định `nutrition`) — mọi session đều chạy trên database này.
- `python src/database/import_data.py` sẽ tự chạy `CREATE DATABASE nutrition IF NOT EXISTS`
  (qua session `system`) rồi nạp toàn bộ Food/Ingredient/Nutrient/ChronicCondition vào đó.
- ⚠️ **Neo4j Community Edition chỉ hỗ trợ 1 database** — khi đó script tự fallback về database
  `neo4j` và log cảnh báo. Dữ liệu vẫn không trộn lẫn với y khoa vì label
  (`Food`, `Ingredient`, `Nutrient`, `ChronicCondition`) không giao với label y khoa
  (`Symptom`, `Disease`, `AgeGroup`, `Sex`). Với Neo4j Enterprise, database `nutrition`
  hoạt động cách ly hoàn toàn.

## Chạy độc lập (dev)

```bash
cp .env.example .env      # điền NEO4J_PASSWORD, LLM_API_KEY...
pip install -r requirements.txt
docker compose -f ..\docker-compose.yml up -d neo4j   # hoặc neo4j local
python src/database/import_data.py                    # nạp graph vào database `nutrition`
python app.py                                          # Flask :5000
```

## API

| Method | Path | Mô tả |
| :--- | :--- | :--- |
| GET | `/api/health` | Healthcheck (dùng bởi Docker healthcheck) |
| GET | `/api/suggestions` | Danh sách món/nguyên liệu cho autocomplete |
| GET | `/api/dish?name=...` | Tra cứu vi chất 1 món/nguyên liệu |
| POST | `/api/consult` | Tư vấn `{query, conditions}` |
| POST | `/api/chat` | Chat tự nhiên `{message, conditions}` → `{reply_text, structured_data}` |
