# Phase 3 — Engineering maturity & enterprise readiness

| | |
|---|---|
| **Mục tiêu** | Chất lượng kỹ thuật (test, API, GraphRAG đều), UX vững; mở đường tuân thủ y tế |
| **Thời lượng** | 3–6 tuần (engineering) |
| **Phụ thuộc** | Phase 2 (CI đã có chỗ gắn test; backup ổn) |
| **Phase trước** | [PHASE2_IMPLEMENTATION_PLAN.md](./PHASE2_IMPLEMENTATION_PLAN.md) |
| **Phase kế tiếp** | [PHASE4_IMPLEMENTATION_PLAN.md](./PHASE4_IMPLEMENTATION_PLAN.md) (clinical / compliance) |

---

## 1. Mục tiêu & DoD (engineering)

1. Có **test tự động** đáng tin: unit + integration + smoke e2e tối thiểu.
2. **GraphRAG eval** regression (precision@k) khi đổi scoring/prompt/model.
3. GraphRAG / chất lượng tư vấn **đồng đều hơn** giữa specialty (hoặc claim marketing thu hẹp cho đúng).
4. FE: router thật, error boundary, i18n rõ, a11y cơ bản.
5. API: versioning `/api/v1`, OpenAPI, chính sách deprecate.

**DoD engineering:** coverage tối thiểu các vùng rủi ro (authz, billing webhook, scoring); CI fail khi eval tuột ngưỡng; OpenAPI khớp route chính; README/marketing không overclaim.

---

## 2. Work streams

### Track 3A — Automated testing (2–3 tuần, song song)

| Task | Approach | Done when |
|---|---|---|
| Unit scoring | `scoring.js`, `phaseEvaluator.js`, `memoryRanking.js`, `memoryCrypto.js` | Vitest/Node test xanh |
| Unit validation | Zod schemas Phase 1 | |
| Integration API | Supertest: auth, admin 403, chat 400, webhook idempotent | Mongo memory / testcontainer |
| FE smoke | Playwright: login, gửi chat, mở settings | Chạy trên CI nightly hoặc PR |
| Fixtures | Bộ messages pediatrics mẫu + expected disease top-k | Trong `back_end/test/fixtures/` |
| Coverage gate | Ngưỡng vừa phải (ví dụ critical paths 70%+) | CI enforce |

**Deps:** `vitest` hoặc `node:test`, `supertest`, `playwright`  
**Cấu trúc đề xuất:**

```text
back_end/test/
  unit/
  integration/
  fixtures/graphrag/
```

---

### Track 3B — GraphRAG quality & parity (2–4 tuần)

| Task | Approach | Done when |
|---|---|---|
| Eval harness | Script chấm precision@k / recall trên gold set | `npm run eval:graphrag` |
| Ngưỡng | Baseline ghi nhận; CI fail nếu giảm > X% | |
| Specialty parity | Port adaptive pipeline sang general (hoặc dermatology) **hoặc** cập nhật docs: “GraphRAG full = pediatrics” | Claim = code |
| Prompt regression | Snapshot / LLM-as-judge nhẹ cho phase 1 vs 2 structure | Không phá format lâm sàng |
| UMLS (tuỳ chọn) | Nếu key có: đo thêm synonym coverage | Document bật/tắt |
| Model pin | Pin version model trên prod; changelog khi đổi | |

**Gold set gợi ý:** 30–50 case (triệu chứng → disease kỳ vọng), tách VI/EN.

---

### Track 3C — Product / frontend / API (2–3 tuần)

| Task | Approach | Done when |
|---|---|---|
| React Router | `/`, `/admin`, `/chat/:id`, deep link | Refresh không mất route |
| Error boundary | Fallback UI + report request-id | |
| i18n | Dictionary tập trung (không hardcode rải) | |
| a11y | Focus trap modal, label, contrast cơ bản | Audit nhanh axe |
| OpenAPI | `openapi.yaml` generate/hand-write cho auth/chat/payment/admin | Review được contract |
| `/api/v1` | Mount lại router; giữ alias cũ có deprecation header | |
| Feature flags | Env hoặc DB flag cho guest chat, specialty mới, memory | Rollback logic không cần redeploy lớn |
| Disclaimer | FE + system prompt: không thay thế bác sĩ; emergency CTA | Pháp lý cơ bản |

---

### Bridge sang Phase 4

Disclaimer FE + system prompt (Track 3C) là bước pháp lý tối thiểu. Toàn bộ **clinical governance, GDPR/PDPA ops, HITL, pentest** nằm ở [PHASE4_IMPLEMENTATION_PLAN.md](./PHASE4_IMPLEMENTATION_PLAN.md) — có thể kickoff song song cuối Phase 3 nhưng **không** chặn DoD engineering.

---

## 3. Thứ tự milestone

| Milestone | Focus | Tuần |
|---|---|---|
| M1 | Test unit critical + gắn CI | 1–2 |
| M2 | Integration webhook/authz + OpenAPI draft | 2–3 |
| M3 | GraphRAG eval harness + baseline | 3–4 |
| M4 | React Router + error boundary + disclaimer | 4–5 |
| M5 | Specialty parity **hoặc** thu hẹp claim | 5–6 |

---

## 4. Tiêu chí chấp nhận (engineering)

- [ ] `npm test` (BE) xanh trên CI
- [ ] Ít nhất 1 workflow e2e smoke (có thể nightly)
- [ ] `eval:graphrag` có baseline + ngưỡng
- [ ] Marketing/README khớp khả năng GraphRAG thật
- [ ] OpenAPI mô tả đúng auth, chat, payment, admin
- [ ] Route FE deep-link `/admin` hoạt động sau refresh

---

## 5. Rủi ro

| Rủi ro | Mitigation |
|---|---|
| Eval LLM flaky | Gold set ưu tiên graph scoring deterministic; LLM judge chỉ cảnh báo |
| Scope parity quá lớn | Thu hẹp claim trước khi port đủ 4 specialty |
| Nhầm Phase 3 = đủ healthcare | Healthcare = Phase 4; không overclaim |
| Testcontainer chậm CI | Fixture Mongo memory cho unit/integration nhẹ |

---

## 6. Exit criteria

### Enterprise kỹ thuật (Phase 0–3)

- Phase 0–2 DoD + Phase 3 M1–M5
- Bảo mật baseline, quan sát được, test/eval, API contract, claim đúng

### Enterprise healthcare

→ [PHASE4_IMPLEMENTATION_PLAN.md](./PHASE4_IMPLEMENTATION_PLAN.md)

---

## 7. Backlog gợi ý sau Phase 3 (kỹ thuật)

- Hybrid Vector + Graph RAG (Chroma/Qdrant)
- Redis rate-limit / session store (scale ngang)
- Multi-region / HA Mongo

(Admin MFA, SOC2 mapping → Phase 4 WP7)

---

## 8. Tài liệu liên quan

| Doc | Vai trò |
|---|---|
| [PHASE0_IMPLEMENTATION_PLAN.md](./PHASE0_IMPLEMENTATION_PLAN.md) | Lockdown secrets |
| [PHASE0_ROTATION_CHECKLIST.md](./PHASE0_ROTATION_CHECKLIST.md) | Ops tick-list |
| [PHASE1_IMPLEMENTATION_PLAN.md](./PHASE1_IMPLEMENTATION_PLAN.md) | Security baseline |
| [PHASE2_IMPLEMENTATION_PLAN.md](./PHASE2_IMPLEMENTATION_PLAN.md) | Reliability & ops |
| Plan này | Engineering maturity |
| [PHASE4_IMPLEMENTATION_PLAN.md](./PHASE4_IMPLEMENTATION_PLAN.md) | Clinical governance & compliance |
