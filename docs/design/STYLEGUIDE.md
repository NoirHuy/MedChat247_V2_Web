# 🎨 MedChat AI — Design System & Style Guide

Tài liệu quy chuẩn phong cách thiết kế giao diện (Design System & UI Style Guide) dùng chung cho cả **Web App (React/CSS)** và **Mobile App (Flutter/Android/iOS)** của hệ thống **MedChat AI**.

---

## 🎨 1. Bảng Màu Chuẩn Y tế & Công nghệ (Color Palette)

Hệ thống hỗ trợ 2 chế độ **Tối (Dark Mode - Mặc định)** và **Sáng (Light Mode)**.

### 🌙 Dark Theme (Mặc định - Khuyên dùng)

| Vai trò | Mã Hex | Xem trước | Ứng dụng thực tế |
| :--- | :--- | :--- | :--- |
| **Nền ứng dụng (App Background)** | `#0F172A` | ⬛ Slate 900 | Nền toàn trang Web & Scaffold Mobile |
| **Bề mặt Card / Sidebar** | `#1E293B` | ⬛ Slate 800 | Khung Chat bot, Thẻ gợi ý, Modal Cài đặt |
| **Khung Nhập liệu (Input Fill)** | `#2A2B2D` | ⬛ Dark Grey | Ô nhập tin nhắn, Dropdown, Textfield |
| **Chủ đạo / Accent Primary** | `#2563EB` | 🟦 Royal Blue | Nút Gửi, Bong bóng chat User, Highlight |
| **Nhấn mạnh phụ / Accent Soft** | `#3B82F6` | 🟦 Bright Blue | Icon y tế, Link, Progress Bar % Bệnh Top 1 |
| **Chữ chính (Text Primary)** | `#FFFFFF` | ⬜ Pure White | Tiêu đề H1-H3, Nội dung tin nhắn chính |
| **Chữ phụ (Text Muted)** | `#94A3B8` | 🔘 Slate 400 | Mô tả thẻ gợi ý, Thời gian, Subtitle |

### ☀️ Light Theme

| Vai trò | Mã Hex | Ứng dụng thực tế |
| :--- | :--- | :--- |
| **Nền ứng dụng** | `#FFFFFF` | Nền trắng ứng dụng |
| **Bề mặt Card / Sidebar** | `#F0F4F9` | Khung Sidebar & Thẻ gợi ý |
| **Chủ đạo / Accent Primary** | `#1A73E8` | Nút bấm & Nhấn mạnh chính |
| **Bong bóng Chat User** | `#E8F0FE` | Màu nền bong bóng người hỏi |

---

### 🚨 Cảnh báo Y tế (Clinical Status Indicators)

| Cấp độ | Mã Hex | Màu sắc | Ý nghĩa y tế |
| :--- | :--- | :--- | :--- |
| **Cấp cứu / Nguy hiểm** | `#EF4444` | 🔴 Red | Dấu hiệu đỏ nguy hiểm, Áp xe, Suy hô hấp |
| **Cảnh báo / Nghi ngờ** | `#F59E0B` | 🟡 Amber | Disclaimer y tế, Dấu hiệu cần chú ý |
| **An toàn / Bình thường** | `#10B981` | 🟢 Emerald | Hướng dẫn tự chăm sóc tại nhà, Nhẹ |

---

## 🔤 2. Hệ thống Font & Kiểu chữ (Typography)

Sử dụng **Font Inter** (Google Fonts) trên mọi nền tảng để đảm bảo độ rõ ràng, hiện đại và chuẩn y khoa.

```css
font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
```

### Hierarchy Kiểu chữ:

| Cấp độ | Kích thước | Trọng lượng | Ứng dụng |
| :--- | :--- | :--- | :--- |
| **Header 1** | `20px` - `24px` | Bold (`700`) | Tiêu đề Chào mừng Welcome Screen |
| **Header 2** | `16px` - `18px` | SemiBold (`600`) | Tiêu đề Bệnh lý nghi ngờ (Top 1 Disease) |
| **Header 3** | `15px` | Medium (`500`) | Tiêu đề Thẻ gợi ý, Tên Chuyên khoa |
| **Body Text** | `14px` | Regular (`400`) | Nội dung Chat, Dẫn chứng, Lý giải phân biệt |
| **Caption / Legal**| `11px` - `12px` | Regular (`400`) | Disclaimer y tế, Ghi chú miễn trừ trách nhiệm |

---

## 🧩 3. Quy chuẩn Thành phần Giao diện (Components)

### 3.1. 4 Thẻ Gợi ý Bệnh lý (Suggestion Cards)
- **Thiết kế**: Hình chữ nhật bo tròn `16px`, nền `#1E293B`, viền mỏng `1px` màu `rgba(255,255,255,0.08)`.
- **Tương tác**: Hover / Tap đổi màu nền sang `#2A3B52`, có micro-animation scale nhẹ `1.02x`.
- **Tên bệnh**: Định dạng thuần triệu chứng, không có icon emoji ở tiêu đề (Single Disease focus).

### 3.2. Khung Chat & Bong bóng Tin nhắn (Chat Bubbles)
- **User Bubble**: Đặt lệch phải, nền màu xanh `#2563EB`, bo góc `16px` (trừ góc dưới phải `2px`).
- **Assistant Bubble**: Đặt lệch trái, nền màu tối `#1E293B`, bo góc `16px` (trừ góc dưới trái `2px`).
- **Nội dung Markdown**: Tự động render Markdown (In đậm `**Bold**`, Danh sách `- List`, Header `###`).

### 3.3. Báo cáo Sàng lọc Y tế Phase 2 (Clinical Screening Report)
- **Phần trăm Độ tin cậy (% Top 1)**: Hiển thị nổi bật bằng Badge tròn hoặc Progress Bar theo thuật toán lũy thừa `1.8` (**Mức hiển thị từ `60% - 80%`** cho bệnh khớp triệu chứng).
- **Hộp Dẫn chứng (Evidence Box)**: Viền trái xanh lá/xanh dương `4px`, in đậm các từ khóa triệu chứng cốt lõi.
- **Hộp Cảnh báo Cấp cứu**: Viền cam/đỏ kèm icon ⚠️ Cảnh báo y tế.

### 3.4. Công tắc Trí nhớ Cá nhân (Personal Memory Switch)
- **Mặc định**: **TẮT (`OFF`)** cho mọi tài khoản mới và khách.
- **Mô tả đi kèm**: *"Mặc định TẮT. Chỉ tự động lưu tiền sử y tế khi bạn chủ động bật công tắc."*

---

## 📏 4. Quy chuẩn Khoảng cách & Bo góc (Spacing & Radius)

- **Bo góc (Border Radius)**:
  - Nút bấm nhỏ / Chip: `8px`
  - Thẻ / Card / Modal: `16px`
  - Ô nhập / Pill button: `24px`
- **Khoảng cách (Spacing Scale)**: `4px` | `8px` | `12px` | `16px` | `24px` | `32px`

---

## 📱 5. Đồng bộ Đa Nền tảng (Web & Flutter Mobile)

| Thành phần UI | Web App (React + CSS) | Mobile App (Flutter Dart) |
| :--- | :--- | :--- |
| **Primary Color** | `var(--bg-accent)` | `Color(0xFF2563EB)` |
| **Surface Color** | `var(--bg-surface)` | `Color(0xFF1E293B)` |
| **Typography** | `Inter, sans-serif` | `GoogleFonts.inter()` |
| **Progress Bar** | CSS Custom Progress | `LinearProgressIndicator` |
