# Phase 0 — Secret rotation checklist

Full plan: [PHASE0_IMPLEMENTATION_PLAN.md](./PHASE0_IMPLEMENTATION_PLAN.md)

Do this **before** treating any environment as safe. Credentials previously appeared in README / examples / chat logs.

## 1. Rotate immediately

- [ ] **Admin account** — change password; disable any `admin@gmail.com` / `123456`-style defaults; create a new admin via DB or invite.
- [ ] **9Router** — rotate dashboard password and all API keys; update `NINEROUTER_API`.
- [ ] **Neo4j** (local compose + Aura/cloud if used) — set a new password; update `NEO4J_PASSWORD` / `NEO4J_AUTH`.
- [ ] **MongoDB** — if exposed beyond loopback, enable auth and rotate.
- [ ] **JWT_SECRET** — generate new secret; all sessions will invalidate (expected).
- [ ] **MEMORY_ENCRYPTION_KEY** — rotate only with a re-encrypt plan (or accept loss of old ciphertext).
- [ ] **Stripe** — roll secret/publishable keys in Stripe Dashboard if they were ever committed or pasted.
- [ ] **UMLS / Google OAuth** — rotate API key / reconsider Client ID exposure; restrict OAuth origins.
- [ ] **VPS firewall** — deny public `4000`, `20128`, `7474`, `7687`, `27017/27018`; allow only 80/443/8080 (or your reverse proxy).

## 2. Repo hygiene

- [ ] Confirm `.env` and `back_end/.env` are gitignored and never pushed.
- [ ] Search git history for leaked strings; if found, treat as compromised and rotate (history rewrite is optional but rotation is mandatory).
- [ ] README and `.env.example` contain **placeholders only**.

## 3. Verify after deploy

```bash
# From the public internet (should fail / timeout)
curl -m 3 http://YOUR_PUBLIC_IP:20128 || true
curl -m 3 http://YOUR_PUBLIC_IP:7687 || true
curl -m 3 http://YOUR_PUBLIC_IP:4000/health || true

# App through reverse proxy only
curl -fsS https://YOUR_DOMAIN/health   # or /api health via proxy
```

- [ ] Backend starts with `NODE_ENV=production` only when all required env vars are set.
- [ ] `/api/error-log` returns 404.
- [ ] Login works with new JWT secret; old cookies rejected.

## 4. Ops vault

Store production secrets in a password manager / vault shared only with ops. Do not paste into issues, PRs, or README.
