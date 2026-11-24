# BreachCoach — Anti-Phishing Training Platform

**Group 15 · Class 1 · Northwind University**

Ethical, locally-runnable phishing simulation and training platform.
Emails go only to a local MailHog inbox. No real credentials are ever stored.

---

## Quick Start (fresh laptop → running in under 10 minutes)

### Prerequisites
- Node.js ≥ 20 (LTS) — https://nodejs.org
- [MailHog](https://github.com/mailhog/MailHog) for local email capture
  - macOS: `brew install mailhog && mailhog`
  - Windows: download `MailHog_windows_amd64.exe` from GitHub releases and run it
  - Linux: `go install github.com/mailhog/MailHog@latest && MailHog`
  - Docker: `docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog`

### Setup
```bash
git clone <repo>
cd breachcoach
cp .env.example .env
# Edit .env — replace SESSION_SECRET with a random 64-char hex string:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

npm install
npm run setup    # create database + run migrations
npm run seed     # insert demo accounts and default rules
npm start
```

Open **http://localhost:3000** in your browser.
MailHog web UI: **http://localhost:8025**

### Demo accounts (DEMO ONLY — change before any real use)
| Username | Password | Role |
|----------|----------|------|
| admin | Admin@demo1 | Admin |
| operator | Operator@demo1 | Operator |
| viewer | Viewer@demo1 | Viewer |

---

## Scripts
```
npm run setup          # run DB migrations
npm run seed           # seed demo data
npm start              # start server
npm run dev            # start with --watch (auto-restart)
npm test               # unit + API tests
npm run test:security  # security tests
npm run test:all       # all tests
npm run report         # security engine evaluation report (FP/FN/latency)
```

---

## Architecture
See `docs/data-model.md` for the full design document:
- Entity-Relationship diagram
- Role/permission matrix
- Input schemas
- API endpoint list
- Error code catalogue
- Audit event format

Security architecture: `docs/reference/security_architecture.drawio`
Campaign workflow: `docs/reference/campaign_workflow.drawio`
Threat model: `docs/reference/threat_model.xlsx`

---

## Ethics and Limitations
- Simulated emails sent **only** to a local MailHog inbox — never to real external targets.
- No real credentials are stored, logged, or transmitted (simulated landing pages discard all input).
- Participants must be explicitly added with a consent record and timestamp.
- Opt-out is permanent and honoured immediately.
- Logs redact email addresses and all secret values.
- For educational use only. See `docs/ethics.md` for the full statement.

---

## Team Allocation
| Member | Area | Owns |
|--------|------|------|
| A | Backend / data / auth | src/repo/, src/security/auth/, src/security/audit/, src/config/ |
| B | Security engine / fixtures | src/security/engine/, fixtures/, tests/unit/ |
| C | Frontend / reporting | src/web/, src/services/, src/api/, src/mail/ |
| D | Automation / security / QA | tests/api/, tests/security/, tests/e2e/, tests/accessibility/ |
