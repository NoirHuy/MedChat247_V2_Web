# Phase 2 — Reliability & operations

| | |
|---|---|
| **Mục tiêu** | Hệ thống quan sát được, deploy lặp lại được, lỗi có cảnh báo, dữ liệu có backup |
| **Thời lượng** | 2–4 tuần |
| **Phụ thuộc** | Phase 1 DoD (đặc biệt rate limit + webhook ổn định) |
| **Phase trước** | [PHASE1_IMPLEMENTATION_PLAN.md](./PHASE1_IMPLEMENTATION_PLAN.md) |
| **Phase kế tiếp** | [PHASE3_IMPLEMENTATION_PLAN.md](./PHASE3_IMPLEMENTATION_PLAN.md) |

---

## 1. Mục tiêu & DoD

1. **Observability:** structured log + request-id + metrics cơ bản + error tracking.
2. **Health thật:** readiness kiểm tra Mongo + Neo4j (+ tuỳ chọn LLM gateway).
3. **CI/CD:** PR chạy lint/test/build; deploy staging tự động; prod có bước approve + rollback.
4. **Backup/restore:** Mongo + Neo4j đã diễn tập restore thành công ít nhất 1 lần.
5. **TLS & surface:** chỉ reverse proxy public; HSTS; không lộ cổng DB/gateway.

**DoD:** Staging có dashboard metric/log; alert khi API 5xx > ngưỡng; runbook restore đã thử; pipeline xanh trên main.

---

## 2. Work packages

### WP1 — Logging & correlation (2–3 ngày)

| Task | Approach | Done when |
|---|---|---|
| Logger | `pino` (hoặc tương đương) JSON logs | Không `console.log` rải rác trên đường hot path |
| Request ID | Middleware gắn `X-Request-Id` (generate hoặc nhận từ Caddy) | Log mỗi request có id |
| Redaction | Không log cookie, Authorization, body password, memory plaintext | Audit sample logs |
| Level theo env | `LOG_LEVEL=info` prod; `debug` staging | |
| Audit y tế | Giữ / chuẩn hoá `SystemLogModel` + memory audit với request-id | Truy vết được 1 phiên chat |

**Deps:** `pino`, `pino-http` (tuỳ chọn)

---

### WP2 — Metrics & alerting (3–5 ngày)

| Task | Approach | Done when |
|---|---|---|
| Metrics endpoint | Prometheus `/metrics` hoặc push (Datadog/Grafana Cloud) | Scrape được |
| RED signals | Rate, Errors, Duration cho `/api/chat`, auth, payment webhook | Dashboard 3 panel tối thiểu |
| Business metrics | Token usage/ngày, số Pro active, số emergency flag | Admin + ops cùng xem |
| Alert | 5xx > X%/5m; webhook Stripe fail; Neo4j down; disk > 85% | Có kênh Slack/Email |
| Uptime check | HTTP check `/ready` từ ngoài | Cảnh báo downtime < 5 phút |

**Đề xuất stack nhẹ:** Grafana Cloud free / Prometheus trên VPS + Grafana.

---

### WP3 — Health & graceful shutdown (1–2 ngày)

| Task | Approach | Done when |
|---|---|---|
| `GET /health` | Liveness: process up | Orchestrator không kill nhầm |
| `GET /ready` | Mongo ping + Neo4j `RETURN 1` | Traefik/Caddy chỉ route khi ready |
| LLM optional | Check 9Router chỉ trên staging hoặc soft-fail | Prod không fail ready vì LLM 1 phút timeout |
| Graceful shutdown | `SIGTERM` → stop nhận request → drain stream chat | Compose restart không cắt cứng ngay |
| Timeouts | HTTP server + Neo4j + LLM timeout rõ | Không treo worker |

---

### WP4 — CI/CD pipeline (3–5 ngày)

| Task | Approach | Done when |
|---|---|---|
| CI PR | GitHub Actions: `oxlint` / FE build / BE boot smoke | PR đỏ nếu fail |
| Test gate | Chạy unit Phase 1 (Zod, admin 403) + thêm dần | |
| Image build | Build & push GHCR/Docker Hub tagged by sha | |
| Staging deploy | Auto khi merge `main` | URL staging cố định |
| Prod deploy | Manual approval / tag `v*` | |
| Rollback | Giữ image trước; `compose pull` image cũ + up | Runbook 1 trang |
| Secret trong CI | GitHub Environments secrets — không hardcode | |

**Files đề xuất:** `.github/workflows/ci.yml`, `deploy-staging.yml`, `deploy-prod.yml`

---

### WP5 — Backup, HA nhẹ, data durability (3–5 ngày)

| Task | Approach | Done when |
|---|---|---|
| Mongo dump | Cron `mongodump` → object storage (S3/R2) hàng ngày | Object mới < 24h |
| Neo4j dump | `neo4j-admin dump` hoặc snapshot volume theo lịch | |
| Restore drill | Quý 1 lần: restore vào máy sạch, app chat được | Biên bản ngày giờ |
| Retention | 7 daily + 4 weekly | Documented |
| Mongo replica (tuỳ chọn) | Nếu SLA cần — 3 node; nếu chưa, ghi rõ RPO/RTO single-node | Quyết định ghi trong runbook |
| Volume | Docker named volumes đã có — bổ sung backup off-box | |

**RPO/RTO mục tiêu ban đầu:** RPO ≤ 24h, RTO ≤ 4h (single VPS).

---

### WP6 — Edge & runtime hardening (1–2 ngày)

| Task | Approach | Done when |
|---|---|---|
| Caddy | HSTS, chỉ TLS 1.2+; không expose backend port | Header verify |
| Compose | Neo4j/Mongo/9Router chỉ network internal + loopback (Phase 0) | Re-verify |
| Resource limits | `mem_limit` / CPU cho từng service | OOM không kéo sập hết host |
| Log rotate | Docker `log-opts max-size` | Disk không đầy vì log |
| Dependency scan | `npm audit` trong CI (high+ fail) | |

---

### WP7 — Runbooks & ownership (1–2 ngày)

Tạo trong `docs/runbooks/`:

| Runbook | Nội dung tối thiểu |
|---|---|
| `incident-api-down.md` | Check ready, logs, Neo4j, Mongo, rollback |
| `incident-stripe.md` | Webhook fail, replay event, đối soát Payment |
| `incident-llm.md` | 9Router down, failover model, bật mock? (thường không trên prod) |
| `restore-mongodb.md` | Lệnh restore + verify |
| `restore-neo4j.md` | Lệnh restore + verify GraphRAG |
| `oncall-contacts.md` | Owner security / billing / infra (nội bộ, không public secret) |

---

## 3. Thứ tự PR / milestone

| Milestone | Nội dung | Tuần gợi ý |
|---|---|---|
| M1 | WP1 + WP3 (log + health) | Tuần 1 |
| M2 | WP4 CI cơ bản + npm audit | Tuần 1–2 |
| M3 | WP2 metrics + alert tối thiểu | Tuần 2–3 |
| M4 | WP5 backup + restore drill | Tuần 3 |
| M5 | WP6 + WP7 runbooks | Tuần 3–4 |

---

## 4. Test / verify plan

- [ ] Kill Mongo → `/ready` = 503; `/health` vẫn 200
- [ ] Restart backend khi có stream → client nhận lỗi sạch / reconnect được
- [ ] CI fail khi cố tình broken build
- [ ] Alert thử (fake 5xx) đến đúng kênh
- [ ] Restore Mongo từ backup hôm qua → login + conversation còn
- [ ] Restore Neo4j → pediatrics GraphRAG trả disease list
- [ ] Deploy staging từ pipeline < 15 phút
- [ ] Rollback prod theo runbook < 30 phút (diễn tập)

---

## 5. Rủi ro

| Rủi ro | Mitigation |
|---|---|
| Single VPS SPOF | Chấp nhận tạm; ghi SLA; Phase sau multi-AZ |
| Metric tốn chi phí | Bắt đầu ít series; sample latency |
| Backup chứa PII | Bucket private, encryption, IAM tối thiểu |
| Alert fatigue | Chỉ 3–5 alert vàng đầu tiên |

---

## 6. Exit criteria → Phase 3

- [ ] Log JSON + request-id trên staging/prod
- [ ] `/ready` dùng cho orchestrator/proxy
- [ ] CI bắt buộc trên PR
- [ ] Backup off-box + 1 restore drill có biên bản
- [ ] Runbook incident + restore đã review
- [ ] Team sẵn sàng đầu tư test/GraphRAG eval (Phase 3)
