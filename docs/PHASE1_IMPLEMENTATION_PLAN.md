# Phase 1 — Security baseline

| | |
|---|---|
| **Mục tiêu** | Hardening HTTP, chống abuse, validate input, AuthZ chặt, Stripe đáng tin |
| **Thời lượng** | 1–2 tuần (1 BE + 0.5 FE) |
| **Phụ thuộc** | Phase 0 DoD xong trên môi trường triển khai |
| **Phase trước** | [PHASE0_IMPLEMENTATION_PLAN.md](./PHASE0_IMPLEMENTATION_PLAN.md) |
| **Phase kế tiếp** | [PHASE2_IMPLEMENTATION_PLAN.md](./PHASE2_IMPLEMENTATION_PLAN.md) |

---

## 1. Mục tiêu & DoD

1. Headers bảo mật (Helmet), CORS allowlist, cookie session đúng flag.
2. Rate limit auth + chat; quota token theo plan (user đăng nhập).
3. Mọi API ghi nhận đều validate schema (Zod).
4. Thanh toán Pro chỉ kích hoạt qua **Stripe webhook idempotent**; production **không** mock card.
5. Client không tự nâng `role` / `planId`; admin routes đều `requireAdmin`.

**DoD:** 4 PR (A–D) merge staging; checklist test cuối file pass; không mở lỗ Phase 0 trở lại.

---

## 2. Quyết định cần chốt trước khi code

| Quyết định | Gợi ý mặc định | Ghi chú |
|---|---|---|
| Chat guest | `ALLOW_GUEST_CHAT=true` (dev), cân nhắc `false` trên prod | `false` = an toàn hơn, đổi UX |
| Rate `/api/*` | 120 req/phút/IP | |
| Rate auth | 10 lần / 15 phút / IP | sign-in, sign-up, Google |
| Rate chat start | Guest 20/giờ/IP; User 60/giờ/userId | Mỗi POST bắt đầu stream |
| Free token/ngày | Theo `plans.js` hiện có — enforce server-side | FE chỉ hiển thị |
| Cookie `SameSite` | `lax` | `strict` nếu cùng site thuần |

---

## 3. Work packages

### WP1 — HTTP hardening (0.5–1 ngày)

| Task | Approach | Done when |
|---|---|---|
| `helmet()` | `server.js` sớm trong middleware chain | Có CSP/frameguard cơ bản (tinh chỉnh CSP nếu FE inline) |
| Tắt `X-Powered-By` | `app.disable('x-powered-by')` | Header không còn |
| `trust proxy` | `app.set('trust proxy', 1)` khi sau Caddy | `req.ip` đúng |
| CORS | Parse `CLIENT_ORIGIN` CSV → exact match + `credentials: true` | Origin lạ bị chặn |
| Cookie | `httpOnly`, `secure: env.cookieSecure`, `sameSite`, path `/` | DevTools đúng flag |

**Deps:** `helmet`  
**Files:** `server.js`, `utils/jwt.js`, auth routes set-cookie

---

### WP2 — Rate limiting & quotas (1–2 ngày)

| Task | Approach | Done when |
|---|---|---|
| Global limiter | `express-rate-limit` trên `/api` | 429 khi vượt |
| Auth limiter | Router `/api/auth` | Brute-force chậm lại |
| Chat limiter | Key = `userId` hoặc IP | Stream không spam |
| Plan quota | Trước `generateReply`: check usage vs plan | Free hết quota → 402/403 rõ message |
| Response 429 | `{ error, retryAfter }` | FE toast |

**Deps:** `express-rate-limit`  
**Lưu ý:** In-memory OK 1 instance; multi-instance → Redis ở Phase 2.

---

### WP3 — Input validation (1–2 ngày)

| Task | Approach | Done when |
|---|---|---|
| Thư mục schemas | `back_end/src/validation/*.js` | |
| Middleware `validate(schema)` | 400 + chi tiết field | |
| Auth | email, password ≥6 (hoặc ≥8 prod), name length | |
| Chat | `messages` max N phần tử, mỗi content max chars; `specialtyId` enum; `lang` ∈ {vi,en} | |
| Payment | `paymentMethodId` format; cấm raw PAN | |
| Memories | content max size, type whitelist | |
| Admin query | pagination limit cap | |

**Deps:** `zod`

---

### WP4 — AuthZ cleanup (0.5–1 ngày)

| Task | Approach | Done when |
|---|---|---|
| Audit `/api/admin/*` | Tất cả qua `requireAuth` + `requireAdmin` | Không route sót |
| Account patch denylist | Không cho set `role`, `planId`, `subscriptionStatus` từ client | Test privilege escalation fail |
| `ALLOW_GUEST_CHAT` | Env flag; prod có thể tắt | Config hoạt động |
| Admin session | Có thể TTL ngắn hơn user thường (tuỳ chọn) | Documented |
| `/api/error-log` | Đã xóa ở Phase 0 — xác nhận không thêm lại | |

---

### WP5 — Stripe webhook & billing trust (2–3 ngày)

| Task | Approach | Done when |
|---|---|---|
| Raw body webhook | `POST /api/payments/webhook` **trước** `express.json()` | `stripe.webhooks.constructEvent` OK |
| Idempotency | Unique `paymentIntentId` / event id trong `PaymentModel` | Replay không double-extend |
| Fulfill chỉ từ webhook | Client success = UX; server tin webhook | Sửa response client không lên Pro |
| Chặn mock prod | `NODE_ENV===production' && !stripe` → không start hoặc 503 billing | |
| FE Elements | `@stripe/stripe-js` / Payment Element; ẩn form fake PAN trên prod | |
| Env | `STRIPE_WEBHOOK_SECRET` trong example + fail-soft/fail-hard prod | |

**Deps:** `stripe` (đã có), FE `@stripe/stripe-js`  
**Tooling:** Stripe CLI `stripe listen --forward-to localhost:4000/api/payments/webhook`

---

### WP6 — Secrets hygiene (0.5 ngày)

| Task | Done when |
|---|---|
| Đồng bộ comment `.env.example` với biến Phase 1 | Onboard không cần hỏi Slack |
| Quyết định PayOS: implement hoặc xóa config chết | Không nửa vời |
| Không log header `Authorization` / cookie | Audit `console.log` |

---

## 4. Thứ tự PR

| PR | Nội dung | Risk |
|---|---|---|
| **PR-A** | WP1 + WP4 | Thấp |
| **PR-B** | WP3 Zod | Trung bình (phải sửa FE nếu gửi field thừa) |
| **PR-C** | WP2 rate limit + quota | Trung bình (tune số trên staging) |
| **PR-D** | WP5 Stripe webhook | Cao — test kỹ với Stripe CLI |

Không merge PR-D production nếu Phase 0 rotation chưa xong.

---

## 5. Thay đổi frontend (tóm tắt)

- Xử lý HTTP 429 / 402 quota (toast + disable send tạm).
- Stripe.js cho link-card / upgrade (nhánh prod).
- Không gửi `role` / `planId` trong body update account.
- Đọc `retryAfter` nếu có.

---

## 6. Test plan tối thiểu

- [ ] Cookie: HttpOnly + Secure (prod) + SameSite
- [ ] CORS: origin không trong list → fail
- [ ] Burst chat → 429
- [ ] Burst login → 429
- [ ] User thường gọi `/api/admin/*` → 403
- [ ] Patch account với `role: admin` → bị ignore/reject
- [ ] Stripe CLI `payment_intent.succeeded` → Pro 1 lần; replay → vẫn 1 lần
- [ ] Prod build không đi được nhánh mock card
- [ ] Zod: messages rỗng / specialty lạ → 400

---

## 7. Cấu trúc thư mục đề xuất

```text
back_end/src/
  middleware/
    rateLimit.js
    validate.js
  validation/
    auth.schemas.js
    chat.schemas.js
    payment.schemas.js
    memory.schemas.js
  routes/
    payment.routes.js    # + webhook handler
    payment.webhook.js   # optional tách file
```

---

## 8. Rủi ro

| Rủi ro | Mitigation |
|---|---|
| CSP phá FE inline/script | Bắt đầu helmet defaults nới CSP; siết dần |
| Rate limit phá demo | Whitelist IP staging; số cao hơn trên staging |
| Webhook local khó | Stripe CLI bắt buộc trong DoD PR-D |
| Guest chat + rate limit vẫn tốn tiền LLM | Kết hợp quota IP + cân nhắc tắt guest trên prod |

---

## 9. Exit criteria → Phase 2

- [ ] PR A–D trên staging xanh theo test plan
- [ ] Số rate-limit đã tune sau 2–3 ngày quan sát
- [ ] Billing webhook là nguồn sự thật duy nhất cho Pro
- [ ] Backlog Phase 2 (logs, health, CI) đã ưu tiên
