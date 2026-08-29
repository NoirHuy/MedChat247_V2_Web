# Phase 4 — Clinical governance & regulated enterprise

| | |
|---|---|
| **Mục tiêu** | Đủ kiểm soát pháp lý, quyền riêng tư, an toàn lâm sàng để gọi là **enterprise healthcare** (không chỉ SaaS kỹ thuật) |
| **Thời lượng** | Quý+ (song song với cuối Phase 3; không chặn DoD engineering Phase 3) |
| **Phụ thuộc** | Phase 0–2 bắt buộc; Phase 3 engineering khuyến nghị (test/eval/change-control dựa trên eval gate) |
| **Phase trước** | [PHASE3_IMPLEMENTATION_PLAN.md](./PHASE3_IMPLEMENTATION_PLAN.md) |
| **Đối tượng** | Bán B2B bệnh viện / xử lý PHI / thị trường có GDPR·PDPA·tương đương |

---

## 1. Mục tiêu & định nghĩa “xong”

Phase 0–3 đưa MedChat tới **enterprise kỹ thuật**. Phase 4 đưa tới **enterprise healthcare**.

1. **Legal foundation:** Terms, Privacy, medical disclaimer, DPA với mọi subprocessor.
2. **Data subject rights:** export + xóa account/memory/conversations vận hành được.
3. **Retention & minimization:** TTL + purge job; không giữ PHI vô hạn.
4. **Consent:** opt-in memory dài hạn; audit trail đồng ý / rút lại.
5. **Clinical safety:** emergency flag → hàng đợi HITL + SLA nội bộ.
6. **Change control:** đổi prompt/model có ticket + eval gate + rollback.
7. **Assurance:** access review định kỳ + pentest (hoặc equivalent) trước go-live “enterprise”.

**DoD tối thiểu để claim “enterprise healthcare”:** legal ký off + export/delete + retention + emergency HITL + change control documented + 1 vòng security review có báo cáo.

---

## 2. Phạm vi

### Trong phạm vi

- Chính sách, quy trình, API/UI quyền chủ thể, retention jobs
- Admin clinical audit / HITL
- Vendor & model governance
- Mapping control kiểu SOC2/ISO (nhẹ, thực dụng) — chưa nhất thiết chứng chỉ chính thức

### Ngoài phạm vi (backlog sau)

- Chứng chỉ SOC2 Type II / ISO 27001 đầy đủ (có thể dùng Phase 4 làm nền)
- FDA/CE medical device classification (thường **tránh** nếu product là “decision support / information only”)
- Multi-region residency phức tạp (chỉ ghi rõ residency hiện tại trừ khi khách yêu cầu)

---

## 3. Work packages

### WP1 — Legal & notices (2–4 tuần, phụ thuộc counsel)

| Task | Deliverable | Done when |
|---|---|---|
| Terms of Service | `docs/legal/` hoặc CMS | Counsel approve |
| Privacy Policy | Mục đích xử lý, legal basis, subprocessors | |
| Medical disclaimer | FE chat + system prompt + signup | User thấy trước khi chat PHI |
| Cookie / tracking notice | Nếu có analytics | |
| DPA template | Stripe, LLM gateway, Neo4j/Aura, hosting | Signed hoặc sẵn sàng ký |
| Subprocessor list | Trang công khai hoặc phụ lục Privacy | Cập nhật được khi đổi vendor |

**Owner:** ops + legal (dev chỉ gắn link/UI).

---

### WP2 — Data subject rights (2–3 tuần engineering)

| Task | Approach | Done when |
|---|---|---|
| Export | `GET /api/account/export` → JSON/ZIP (profile, conversations, memories decrypted cho owner) | User tải được |
| Delete account | Soft-delete → hard-delete sau cooling (ví dụ 7–30 ngày) hoặc hard ngay theo policy | Không còn PII truy vấn được |
| Cascade | User, conversations, memories, payment tokens refs, logs PII-minimized | Checklist bảng DB |
| Admin fulfill | Nếu xóa thủ công: runbook + audit log | |
| UI | Settings: “Export data” / “Delete account” + confirm | |
| Rate limit | Export/delete chống abuse | |

**Files gợi ý:** `routes/account.routes.js`, `services/privacy/exportUser.js`, `services/privacy/deleteUser.js`

---

### WP3 — Retention & minimization (1–2 tuần)

| Task | Approach | Done when |
|---|---|---|
| Policy bảng | Chat / system logs / memory / payment metadata — TTL từng loại | Doc trong `docs/legal/retention.md` |
| Purge cron | `node-cron` job (đã có billing scheduler pattern) | Dry-run + prod schedule |
| Log redaction | Không ghi symtom raw vào log nếu không cần; dùng request-id | Sample audit |
| Memory minimization | Chỉ lưu category đã validate; max/user (đã có `MEMORY_MAX_PER_USER`) | Enforce + purge thừa |
| Backup vs retention | Backup cũng tuân TTL hoặc encrypted + access cực hạn | Ghi trong runbook Phase 2 |

---

### WP4 — Consent & memory governance (1–2 tuần)

| Task | Approach | Done when |
|---|---|---|
| Opt-in memory | Mặc định off hoặc explicit toggle trước khi extract | Không extract nếu chưa consent |
| Session pause | Đã có `sessionMemoryPaused` — nối với settings bền | |
| Consent audit | `memory_audit` / bảng `consent_events`: grant/revoke + timestamp + version policy | Truy vết được |
| Re-consent | Khi đổi Privacy version → yêu cầu lại | |
| Encryption keys | Rotation playbook (re-encrypt hoặc invalidate) | Doc + dry-run staging |

---

### WP5 — Clinical safety & HITL (2–4 tuần)

| Task | Approach | Done when |
|---|---|---|
| Taxonomy | Chuẩn hoá `Emergency` / `Warning` / `Normal` từ model + rules | Schema cố định |
| Queue | Admin dashboard: danh sách phiên cần review | Filter + assign |
| SLA | Ví dụ Emergency review < 24h (nội bộ; không hứa cấp cứu thay 115) | Metric + alert |
| Escalation UI | FE: số cấp cứu / “gọi cấp cứu địa phương” rõ | Disclaimer không mơ hồ |
| Immutable audit | Append-only (hoặc write-once) cho safety decisions | Không sửa im lặng |
| False positive tuning | Review tuần đầu; chỉnh prompt/rules kèm Phase 3 eval | |

**Lưu ý sản phẩm:** MedChat **không** thay thế dịch vụ cấp cứu. HITL là kiểm duyệt/ops, không phải telemedicine trừ khi có giấy phép riêng.

---

### WP6 — Model & prompt change control (1–2 tuần quy trình + kỹ thuật)

| Task | Approach | Done when |
|---|---|---|
| Ticket template | Lý do đổi, model id, prompt diff, rủi ro | Trong issue tracker |
| Eval gate | Bắt buộc `npm run eval:graphrag` (+ checklist lâm sàng) trước prod | CI hoặc manual gate |
| Pin model | Prod pin version; cấm `latest` trôi | Env documented |
| Rollback | Giữ prompt artifact + model id trước đó | Rollback < 1h theo runbook |
| Dual control | Đổi prod cần 2 người (dev + clinical/ops owner) | Policy viết rõ |

**Runbook:** `docs/runbooks/change-prompt-model.md`

---

### WP7 — Access, vendor, assurance (liên tục)

| Task | Approach | Done when |
|---|---|---|
| Admin MFA | TOTP hoặc WebAuthn cho `role=admin` | Bắt buộc trên prod |
| Access review | Quý: liệt kê admin, disable thừa | Checklist có ngày |
| Least privilege | Tách role `ops` vs `admin` vs `clinical_reviewer` (nếu cần) | RBAC trong code |
| Vendor register | LLM, Stripe, Neo4j, host — owner, DPA, exit plan | Spreadsheet/vault |
| LLM failover | Đã có 9Router — đo và document hành vi khi fail | |
| Data residency | Ghi rõ region Mongo/Neo4j/LLM | Privacy + sales ready |
| Pentest | External hoặc internal structured; fix Critical/High trước claim | Báo cáo + retest |
| Control map (optional) | Map Phase 0–4 → SOC2 CC / ISO Annex A (bảng) | Sẵn sàng audit sau |

---

## 4. Thứ tự milestone

| Milestone | Focus | Thời điểm gợi ý |
|---|---|---|
| M1 | WP1 legal drafts + disclaimer FE | Song song cuối Phase 3 |
| M2 | WP2 export/delete | Sau Phase 3 M4+ |
| M3 | WP3 retention jobs | Sau M2 |
| M4 | WP4 consent audit | Sau M2 |
| M5 | WP5 HITL emergency queue | Sau admin dashboard ổn (Phase 1–2) |
| M6 | WP6 change control + eval gate bắt buộc | Sau Phase 3 eval harness |
| M7 | WP7 MFA admin + pentest + access review | Trước go-live “enterprise” branding |

---

## 5. Tiêu chí chấp nhận

- [ ] Terms + Privacy + disclaimer live; DPA template sẵn
- [ ] User tự export và xóa account (hoặc request có SLA ≤ 30 ngày nếu manual)
- [ ] Retention policy có cron purge chạy staging + prod
- [ ] Memory không chạy extract khi chưa consent
- [ ] Emergency phiên vào queue admin; có audit
- [ ] Đổi model/prompt trên prod có ticket + eval evidence
- [ ] Admin MFA bật
- [ ] Pentest (hoặc security review tương đương) đã đóng Critical/High
- [ ] Marketing **không** gọi sản phẩm là “bác sĩ AI” / “chẩn đoán thay thế”

---

## 6. Rủi ro

| Rủi ro | Mitigation |
|---|---|
| Overclaim lâm sàng → rủi ro pháp lý | Disclaimer + claim review sales/marketing |
| Delete không cascade hết PII | Inventory schema trước khi code; test integration |
| HITL tạo kỳ vọng “có bác sĩ 24/7” | Copy UI: ops review, không phải telehealth trừ khi licensed |
| Counsel chậm | Ship disclaimer + export/delete kỹ thuật trước; legal iterate |
| Pentest muộn | Book sớm; fix song song M5–M7 |

---

## 7. Phân biệt claim

| Claim | Điều kiện |
|---|---|
| Enterprise kỹ thuật | Phase 0–3 DoD |
| Enterprise healthcare / regulated-ready | Phase 4 DoD tối thiểu (mục 1) |
| Certified (SOC2/ISO) | Ngoài Phase 4 — dự án riêng dựa trên control map WP7 |

---

## 8. Tài liệu liên quan

| Doc | Vai trò |
|---|---|
| [PHASE0_IMPLEMENTATION_PLAN.md](./PHASE0_IMPLEMENTATION_PLAN.md) | Secrets & lockdown |
| [PHASE1_IMPLEMENTATION_PLAN.md](./PHASE1_IMPLEMENTATION_PLAN.md) | Security baseline |
| [PHASE2_IMPLEMENTATION_PLAN.md](./PHASE2_IMPLEMENTATION_PLAN.md) | Ops, backup, runbooks |
| [PHASE3_IMPLEMENTATION_PLAN.md](./PHASE3_IMPLEMENTATION_PLAN.md) | Test, eval, API — nền cho change control |
| Plan này | Clinical governance & compliance |
| [PHASE0_ROTATION_CHECKLIST.md](./PHASE0_ROTATION_CHECKLIST.md) | Ops secrets |
