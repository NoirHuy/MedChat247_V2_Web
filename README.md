---
title: MedAI - Enterprise Clinical AI & Multi-Gateway Platform
emoji: 🩺
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
tags:
  - medical-ai
  - vps-deployment
  - paypal-sdk
  - admin-dashboard
  - 9router-ai-gateway
  - knowledge-graph
  - neo4j
license: mit
short_description: Báo cáo Kiến trúc Hạ tầng Triển khai VPS, Cổng PayPal SDK, Admin Dashboard & 9Router AI Gateway
---

# 🩺 MedAI: System Architecture & Deployment Benchmark Report
### *Hệ Thống Trợ Lý Tư Vấn Y Tế Lâm Sàng Tích Hợp Hạ Tầng VPS Production, Cổng Thanh Toán PayPal SDK, Admin Dashboard & 9Router AI Gateway*

---

## 📌 1. BẢN ĐỒ TRIỂN KHAI HỆ THỐNG & ĐIỂM CUỐI DỊCH VỤ (SYSTEM LINKS & SITEMAP)

Hệ thống MedAI được triển khai trực tiếp trên hạ tầng máy chủ ảo riêng **VPS (Virtual Private Server)** kết hợp cơ chế Reverse Proxy Caddy, chứng chỉ mã hóa SSL và Docker Compose orchestrator.

Bảng thông tin chi tiết các phân hệ dịch vụ (thông tin xác thực xem `.env`):

| Phân Hệ Dịch Vụ | Đường Dẫn Production | Đường Dẫn Local Dev | Ghi Chú |
|---|---|---|---|
| 🌐 **Ứng Dụng Web Client** | `https://<your-domain>` | `http://localhost:8080` | React 19 SPA, Responsive Glassmorphism, Đa ngôn ngữ (VI/EN) |
| 📊 **Trang Quản Trị (Admin)** | `https://<your-domain>/admin` | `http://localhost:8080/admin` | Giám sát vận hành, theo dõi doanh thu, thống kê token |
| 🔀 **9Router AI Gateway** | localhost-only (`127.0.0.1:20128`, truy cập qua SSH tunnel) | `http://localhost:20128` | Quản trị API Key, Load Balancing & Failover — không expose ra internet vì chứa LLM API key |
| ⚡ **Backend API** | localhost-only (Caddy proxy `/api/*` → `backend:4000`) | `http://localhost:4000` | Node.js Express, JWT Auth, MongoDB & PayPal Payment |
| 🥗 **Nutrition Service** | internal (không expose) | `http://localhost:5000` | Python Flask (gunicorn) tư vấn dinh dưỡng, Neo4j database `nutrition` |
| 🌐 **Neo4j Knowledge Graph** | localhost-only (`127.0.0.1:7474` browser / `7687` bolt) | `neo4j+s://...` nếu dùng AuraDB | Tri thức y khoa SymCAT (474 triệu triệu chứng, 801 bệnh lý) — container `neo4j:5.18-community` |

> **Lưu ý:** Thông tin xác thực (password, API key, secret) được cấu hình trong file `.env`. Không lưu credentials trong code hoặc tài liệu công khai.

---

## 🚀 2. HẠ TẦNG TRIỂN KHAI MÁY CHỦ VPS & CADDY AUTO-SSL (PRODUCTION DEPLOYMENT)

Hệ thống được thiết kế và vận hành trên môi trường **Cloud VPS** theo tiêu chuẩn hạ tầng doanh nghiệp:

* **Tự Động Cấp & Gia Hạn SSL Qua Caddy Container (Caddy Auto-HTTPS)**: Tích hợp Caddy Server Container làm Reverse Proxy cao cấp, tự động đăng ký, xác thực ACME và gia hạn chứng chỉ mã hóa an toàn **HTTPS SSL (Let's Encrypt / ZeroSSL)** hoàn toàn tự động 100%.
* **Đóng Gói Container Khối (Docker Compose Architecture)**: Các dịch vụ cốt lõi (Caddy Reverse Proxy, Frontend, Backend, MongoDB 7.0 và 9Router AI Gateway) được container hóa cô lập, quản lý và sẵn sàng khởi chạy đồng bộ với 1 lệnh duy nhất.
* **Độ Ổn Định & Khả Năng Mở Rộng**: Cơ sở dữ liệu MongoDB 8.0 (container kèm service backup hằng ngày) và Neo4j 5.18 đảm bảo tối ưu hóa phần cứng, hoạt động liên tục 24/7 không đứt gạt.

---

## 🔀 3. QUẢN LÝ TẬP TRUNG MÔ HÌNH AI QUA 9ROUTER AI GATEWAY

MedAI tích hợp hạ tầng **9Router AI Gateway** để đảm bảo khả năng chịu lỗi và cân bằng tải:

* **Quản Lý API Key Tập Trung**: Cập nhật, xoay vòng (Rotate) và thiết lập hạn mức chi phí cho các API Key (OpenRouter, Gemini 3.1 Flash, DeepSeek-v4) từ một giao diện duy nhất mà không cần khởi động lại máy chủ backend.
* **Tự Động Cân Bằng Tải & Điều Hướng Dự Phòng (Load Balancing & Dynamic Failover)**: Khi mô hình chính gặp sự cố quá tải hoặc hết rate-limit, 9Router tự động điều chuyển yêu cầu chẩn đoán sang mô hình dự phòng với độ trễ thấp.
* **Giám Sát Latency & Token Analytics**: Theo dõi số liệu thời gian phản hồi (Latency ms) và lượng Token tiêu thụ của từng cuộc gọi AI theo thời gian thực.

> Thông tin đăng nhập 9Router: xem biến môi trường tương ứng trong `.env`.

---

## 💳 4. CỔNG THANH TOÁN QUỐC TẾ PAYPAL SDK REAL-TIME

Hệ thống tích hợp giải pháp thanh toán thương mại điện tử qua **PayPal REST API v2** nhằm cung cấp quy trình nâng cấp gói Pro y tế cao cấp (99.000đ/tháng) hoàn chỉnh:

* **Xác Thực Thẻ Bảo Mật (PayPal PaymentMethods)**: Hỗ trợ thanh toán bằng thẻ Visa, MasterCard, JCB, AMEX trên hạ tầng PayPal.
* **Thanh Toán Đơn Hàng (PayPal Orders API)**: Khởi tạo và xác nhận giao dịch 99.000 VNĐ qua PayPal.
* **Tự Động Kích Hoạt Gói Pro 30 Ngày**: Ngay khi giao dịch PayPal báo trạng thái `COMPLETED`, backend kích hoạt quyền truy cập gói Pro, lưu ngày hết hạn 30 ngày và ghi nhận lịch sử giao dịch.
* **Quản Lý Thanh Toán & Chống Trừ Tiền Nhầm**:
  - Hỗ trợ xem và quản lý phương thức thanh toán.
  - Bắt buộc xác nhận trước khi nâng cấp.
  - Vô hiệu hóa nút hạ cấp thủ công từ Pro về Free để tuân thủ chu kỳ gói gia hạn.

---

## 📊 5. TRANG QUẢN TRỊ AN TOÀN & VẬN HÀNH DỰ ÁN (ADMIN DASHBOARD)

Trang quản trị hệ thống cung cấp cho đội ngũ vận hành và nhà quản lý cái nhìn toàn diện:

* **Thống Kê Doanh Thu Real-time**: Tổng hợp tổng doanh thu từ các giao dịch thanh toán gói Pro qua PayPal.
* **Giám Sát Cuộc Trò Chuyện & Mức Độ Khẩn Cấp**: Thống kê số lượt tư vấn y tế (Hôm nay / Tuần / Tháng), phân loại mức độ khẩn cấp và danh mục Triệu chứng phổ biến.
* **Nhật Ký Vận Hành (System Logs & Token Audit)**: Theo dõi thời gian phản hồi trung bình của hệ thống (ms), tỷ lệ lỗi và thống kê chi phí API token AI.
* **Giám Sát An Toàn Y Tế (Safety Emergency Audit)**: Danh sách tổng hợp các phiên tư vấn có dấu hiệu cấp cứu hoặc bị gắn cờ cần kiểm duyệt y khoa.

---

## 🔮 6. ĐỊNH HƯỚNG PHÁT TRIỂN TƯƠNG LAI (FUTURE DEVELOPMENT ROADMAP)

### 1. 🧠 Cơ Chế Ghi Nhớ Ngữ Cảnh Người Dùng Dài Hạn (Long-term User Memory & Dynamic Profiling)
* **Tóm Tắt Hội Thoại Tự Động (Dialogue Summarization Engine)**: Tự động chạy tiến trình ngầm phân tích các phiên chat để cô đọng nội dung tư vấn thành các thẻ tri thức ngắn gọn.
* **Trích Xuất Hồ Sơ Sức Khỏe Cá Nhân (Patient Profile Extraction)**: Tự động nhận diện và bóc tách các thuộc tính y tế quan trọng của người bệnh bao gồm:
  - **Tiền sử bệnh lý nền**: *Tiểu đường Type 2, Cao huyết áp, Hen suyễn...*
  - **Dị ứng & Phản ứng thuốc**: *Dị ứng Penicillin, Aspirin...*
  - **Yếu tố nguy cơ & Thói quen sinh hoạt**: *Hút thuốc, Tiền sử gia đình mắc bệnh tim mạch...*
* **Cập Nhật Động**: Dữ liệu hồ sơ người dùng được mã hóa và lưu trữ an toàn trong `user_memory`, liên tục được tích lũy và cập nhật qua các lượt trò chuyện theo thời gian.

### 2. 📚 Kiến Trúc Hybrid GraphRAG (Retrieval-Augmented Generation + Knowledge Graph)
* **Tích Hợp Cơ Sở Dữ Liệu Vector (Vector Database)**: Kết hợp Vector Embeddings để truy vấn ngữ nghĩa sâu từ sách y khoa và phác đồ điều trị chính thống.
* **Truy Xuất Tri Thức Đa Tầng (Hybrid Retrieval)**: Khi người bệnh đặt câu hỏi, hệ thống thực hiện đồng thời:
  1. **Graph Retrieval**: Trích xuất quan hệ xác suất Bệnh lý - Triệu chứng từ Đồ thị Neo4j.
  2. **Vector RAG Retrieval**: Truy xuất hồ sơ sức khỏe cá nhân của người dùng và tài liệu y khoa liên quan.
* **Tư Vấn Cá Nhân Hóa Đột Phá**: Đưa toàn bộ ngữ cảnh tiền sử bệnh và tri thức y học vào prompt của LLM, giúp MedAI đóng vai trò như một **Bác sĩ gia đình AI** hiểu rõ lịch sử sức khỏe dài hạn của từng bệnh nhân.

---

## 🥗 7. CHUYÊN KHOA TƯ VẤN DINH DƯỠNG (NUTRITION CONSULTATION SERVICE)

Tích hợp module **Dinh dưỡng — Bệnh mạn tính** theo mô hình **Monorepo + Node.js API Gateway**:

* **Kiến trúc**: Browser → Node `back_end` (:4000, giữ nguyên Auth/Quota/Rate-limit/SystemLog/Memory)
  → Flask `nutrition_service` (:5000, internal only) → **Neo4j database `nutrition`**.
* **Cách ly dữ liệu Neo4j (Multi-Database)**: dữ liệu món ăn/vi chất nằm trong database
  `nutrition`, tách biệt hoàn toàn với database `neo4j` của GraphRAG y khoa
  (Symptom/Disease/AgeGroup/Sex). Script import tự chạy `CREATE DATABASE nutrition IF NOT EXISTS`.
  ⚠️ Neo4j **Community** chỉ hỗ trợ 1 database — service tự fallback về `neo4j`
  (vẫn không trộn dữ liệu vì label riêng: `Food`/`Ingredient`/`Nutrient`/`ChronicCondition`).
* **Chức năng**: đánh giá món ăn/nguyên liệu theo 5 bệnh nền (Tiểu đường, Tăng HA, Gout,
  Thận chưa lọc máu, Mỡ máu), thẻ `NutritionCard` hiển thị 4 đại dưỡng chất + vi chất +
  ghi chú LLM + món thay thế.
* **Nạp dữ liệu Knowledge Graph (chạy 1 lần sau khi container lên)**:

```bash
docker compose exec nutrition python src/database/import_data.py
```

* **Chạy standalone (dev)**: xem `nutrition_service/README.md`.

---

## 🛠️ 8. HƯỚNG DẪN CẤU HÌNH & KHỞI CHẠY (SETUP GUIDE)

### 8.1. Cấu hình biến môi trường

```bash
# Sao chép file mẫu
cp back_end/.env.example back_end/.env

# Chỉnh sửa back_end/.env với các giá trị thực tế:
# - JWT_SECRET, MEMORY_ENCRYPTION_KEY: Tạo bằng node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# - NEO4J_PASSWORD: Đặt password mới cho Neo4j
# - PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET: Lấy từ developer.paypal.com
# - Các API key AI: Cấu hình trong 9Router dashboard hoặc .env

# Nâng quyền Admin cho một tài khoản (không còn cấp admin theo email):
cd back_end && node scripts/promote-admin.js admin@your-domain.example.com
```

### 8.2. Khởi chạy bằng Docker

```bash
# 1. Khởi chạy toàn bộ hạ tầng container:
docker compose up -d

# 2. Kiểm tra trạng thái container:
docker compose ps

# 3. Xem log vận hành backend thời gian thực:
docker compose logs -f backend
```

### 8.3. Phát triển cục bộ (Local Development)

```bash
# Backend (cổng 4000):
cd back_end && npm install
npm run dev          # node --watch src/server.js
npm run lint         # oxlint
npm test             # vitest run (unit tests)

# Nutrition service (Python, cổng 5000):
cd nutrition_service && pip install -r requirements.txt -r requirements-dev.txt
ruff check .         # lint
pytest               # unit tests

# Frontend (cổng 5173, proxy /api -> localhost:4000):
npm install
npm run dev          # vite
npm run lint         # oxlint
npm test             # vitest run (unit tests)
npm run build        # production bundle -> dist/
```

> Lưu ý: ở môi trường dev, Vite tự động proxy `/api/*` tới `http://localhost:4000`
> (coi `vite.config.js`). Nếu cần trỏ sang backend khác, đặt `VITE_API_URL` trong `.env`.

### 8.4. CI (GitHub Actions)

`.github/workflows/ci.yml` chạy 3 job trên mỗi push/PR: **frontend** (oxlint → vitest → build),
**backend** (oxlint → vitest) và **nutrition** (ruff → pytest). File này cần được commit và
push lên GitHub để pipeline kích hoạt.

---

## 🚀 9. CHECKLIST GO-LIVE (TRƯỚC KHI MỞ CHO NGƯỜI DÙNG THẬT)

### Bảo mật hạ tầng
- [ ] Đặt `MONGO_ROOT_USER` / `MONGO_ROOT_PASS` / `REDIS_PASSWORD` mạnh trong root `.env`
      (compose **từ chối khởi chạy** nếu thiếu — sinh bằng
      `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`,
      chỉ dùng chữ-số để tránh lỗi URI-escape).
- [ ] Đổi `NEO4J_AUTH` trong `.env` trước lần khởi tạo đầu tiên — backend **từ chối boot**
      ở production nếu vẫn dùng placeholder `CHANGE_THIS_PASSWORD`.
- [ ] Chạy production bằng overlay: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
      (tự bật `COOKIE_SECURE=true`, HTTPS qua Caddy).

### Sao lưu & giám sát
- [ ] Service `db-backup` dump MongoDB vào `./backups/` mỗi ngày (giữ 14 ngày).
      **Sao chép thư mục này off-site định kỳ** (rclone/S3) — Docker volume không phải backup.
- [ ] Trỏ uptime monitor (UptimeRobot/Better Stack…) vào `/api/monitoring/health`.
- [ ] Chạy smoke test sau mỗi lần deploy: `BASE_URL=https://<domain> npm run smoke`.
- [ ] (Tùy chọn) Gắn Sentry cho backend + frontend để bắt lỗi runtime.

### Email verification (bắt buộc cho signup)
- [ ] Cấu hình SMTP thật trong `back_end/.env`.
- [ ] Thêm bản ghi **SPF, DKIM, DMARC** cho domain — nếu không mail xác minh sẽ rơi spam
      và người dùng không thể đăng ký.

### Thanh toán PayPal
- [ ] Chuyển `PAYPAL_MODE=live` + cặp Client ID/Secret live.
- [ ] Register webhook URL `https://<domain>/api/payments/paypal/webhook` trên PayPal Dashboard
      và điền `PAYPAL_WEBHOOK_ID` khớp.
- [ ] Test đủ flow: create → capture → refund/cancel trên môi trường live.

---

*MedAI — Infrastructure Resilience, AI Orchestration & Evidence-Based Clinical Systems.*
