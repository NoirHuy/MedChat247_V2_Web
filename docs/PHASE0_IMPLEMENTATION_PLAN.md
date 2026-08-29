# Phase 0 — Dừng chảy máu (Secret lockdown)

| | |
|---|---|
| **Mục tiêu** | Loại bỏ credential lộ ra ngoài, khóa bề mặt tấn công khai, production fail-fast nếu thiếu secret |
| **Thời lượng** | 1–3 ngày (ops + 1 dev) |
| **Phụ thuộc** | Không |
| **Trạng thái code** | Phần lớn đã làm trong repo; phần rotate trên VPS/dashboard **bắt buộc làm tay** |
| **Checklist ops** | [PHASE0_ROTATION_CHECKLIST.md](./PHASE0_ROTATION_CHECKLIST.md) |
| **Phase kế tiếp** | [PHASE1_IMPLEMENTATION_PLAN.md](./PHASE1_IMPLEMENTATION_PLAN.md) |

---

## 1. Mục tiêu & định nghĩa “xong”

1. Không còn password / API key / admin mặc định trong README, `.env.example`, compose hardcode.
2. Mọi secret production đã **xoay (rotate)** sau khi lộ.
3. Neo4j, Mongo, 9Router, API thô **không** publish ra internet (chỉ loopback / private network).
4. `NODE_ENV=production` → process **từ chối start** nếu JWT / memory key / Neo4j / gateway / Mongo thiếu hoặc yếu.
5. Endpoint debug lộ env (`/api/error-log`) đã gỡ.

**Definition of Done (DoD):** checklist rotation tick hết + verify từ IP public không vào được cổng nội bộ + backend prod boot được với secret mới.

---

## 2. Phạm vi

### Trong phạm vi

- Docs / example env / fail-fast `env.js`
- Bind port loopback trong Docker Compose
- Gỡ endpoint debug
- Runbook rotate + firewall
- Sanitize `.env` local (gitignore)

### Ngoài phạm vi (để Phase 1+)

- `helmet`, rate limit, Zod, Stripe webhook
- MFA admin, pentest, SIEM
- Rewrite git history (tuỳ chọn; **rotate vẫn bắt buộc** dù có rewrite)

---

## 3. Work packages

### WP0.1 — Repo hygiene (0.5 ngày) ✅ phần lớn đã làm

| Task | Chi tiết | Done when |
|---|---|---|
| README | Bảng service **không** chứa credential | Không grep ra password/admin mặc định |
| `.env.example` | Placeholder rỗng + comment | An toàn để commit |
| `back_end/.env` | Gitignore; giá trị lộ phải xóa/điền lại | Không commit được `.env` |
| Search | `rg` các pattern key/password cũ trong tracked files | Chỉ còn trong denylist / checklist |

### WP0.2 — Fail-fast cấu hình (0.5 ngày) ✅ đã làm

| Task | File | Done when |
|---|---|---|
| Denylist secret yếu | `back_end/src/config/env.js` | Prod throw nếu dùng default đã biết |
| Bắt buộc env prod | JWT (≥32), MEMORY_KEY (≥32), NEO4J_PASSWORD, NINEROUTER_API, MONGODB_URI | Container không lên nếu thiếu |
| Dev warning | Console warn khi JWT/Neo4j yếu hoặc trống | Dev vẫn chạy được có cảnh báo |
| Log LLM | Dùng `NINEROUTER_API` / model chat (không còn `openrouterApiKey` sai tên) | Log đúng |

### WP0.3 — Network lockdown (0.5 ngày) ✅ compose; ⏳ firewall VPS

| Task | Chi tiết | Done when |
|---|---|---|
| Compose bind | 9Router `127.0.0.1:20128`, Neo4j `127.0.0.1:7474/7687` | `docker compose config` đúng |
| `NEO4J_AUTH` bắt buộc | `${NEO4J_AUTH:?...}` từ root `.env` | `compose up` fail nếu chưa set |
| Prod overlay | `NODE_ENV=production`, `COOKIE_SECURE=true` | `docker-compose.prod.yml` |
| Firewall VPS | Chỉ mở 80/443/(8080 nếu cần); DROP 4000, 20128, 7474, 7687, 27017 | `curl` từ ngoài timeout |
| Gỡ debug API | Xóa `/api/error-log` | 404 |

### WP0.4 — Rotate secrets (ops, 0.5–1 ngày) ⏳ bắt buộc thủ công

Xem [PHASE0_ROTATION_CHECKLIST.md](./PHASE0_ROTATION_CHECKLIST.md).

| Secret | Hành động |
|---|---|
| Admin app | Đổi mật khẩu / tạo admin mới; vô hiệu default cũ |
| 9Router | Đổi password dashboard + rotate API key → `NINEROUTER_API` |
| Neo4j (local + cloud) | Password mới → `NEO4J_PASSWORD` / `NEO4J_AUTH` |
| JWT + memory key | Random 48+ bytes hex; chấp nhận logout hàng loạt |
| Stripe / UMLS / Google | Rotate trên dashboard nhà cung cấp |
| Mongo | Bật auth nếu từng expose |

---

## 4. Thứ tự thực hiện (runbook)

```text
1. Rotate trên dashboard (9Router, Neo4j, Stripe, admin)  ← làm TRƯỚC khi redeploy
2. Điền root .env + back_end/.env (secret mới)
3. Firewall VPS
4. docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
5. Verify: health qua proxy OK; cổng nội bộ từ public FAIL
6. Đăng nhập admin mới; xác nhận chat/GraphRAG
7. Tick hết PHASE0_ROTATION_CHECKLIST.md
```

---

## 5. Kiểm thử / verify

```bash
# Nội bộ (qua proxy / localhost) — phải OK
curl -fsS http://127.0.0.1:8080/   # hoặc https://$DOMAIN

# Từ máy ngoài / IP public — phải FAIL hoặc timeout
curl -m 3 http://$PUBLIC_IP:20128 || true
curl -m 3 http://$PUBLIC_IP:7687 || true
curl -m 3 http://$PUBLIC_IP:4000/health || true
curl -m 3 http://$PUBLIC_IP:8080/api/error-log || true   # expect 404 nếu vào được app path
```

- [ ] Prod boot fail khi cố ý để `JWT_SECRET` ngắn
- [ ] Prod boot OK với secret đủ mạnh
- [ ] Cookie session cũ invalidate sau đổi JWT
- [ ] GraphRAG pediatrics vẫn query Neo4j được

---

## 6. Rủi ro & mitigation

| Rủi ro | Mitigation |
|---|---|
| Đổi Neo4j password quên cập nhật volume cũ | Reset volume hoặc `ALTER USER` trong Neo4j |
| Đổi MEMORY_ENCRYPTION_KEY mất đọc memory cũ | Giữ key cũ đến khi có job re-encrypt (Phase 1+/3) |
| Compose `${NEO4J_AUTH:?}` lấy từ root `.env` không phải `back_end/.env` | Copy biến vào root `.env` theo `.env.example` |
| Secret vẫn nằm trong git history | Rotate vẫn đủ; rewrite history chỉ khi repo đã public |

---

## 7. Deliverables

| Artifact | Vị trí |
|---|---|
| README sạch | `README.md` |
| Env templates | `.env.example`, `back_end/.env.example` |
| Fail-fast | `back_end/src/config/env.js` |
| Compose lockdown | `docker-compose.yml`, `docker-compose.prod.yml` |
| Ops checklist | `docs/PHASE0_ROTATION_CHECKLIST.md` |
| Plan này | `docs/PHASE0_IMPLEMENTATION_PLAN.md` |

---

## 8. Exit criteria → vào Phase 1

- [ ] Checklist rotation hoàn tất trên **staging + production**
- [ ] Không còn secret trong tracked files
- [ ] Firewall + loopback đã verify
- [ ] Team đồng ý số rate-limit / `ALLOW_GUEST_CHAT` (input cho Phase 1)
