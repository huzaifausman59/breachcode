# BreachCoach — Phase 1 Design Document

## 1. Entity-Relationship Overview

```
users (1) ──< sessions
users (1) ──< audit_events (as actor)
users (1) ──< campaigns (as created_by)

campaigns (1) ──< campaign_recipients (1) ──< events
campaigns (1) ──> templates (FK)
campaigns (1) ──< campaign_participants (join)

templates (1) ──< template_indicators (derived, stored with result)
templates (1) ──< lessons (1 lesson per template)

participants (1) ──< campaign_participants (join)
participants (1) ──< events (via campaign_recipient)

rules (versioned) ──< results (rule_version FK)
results (1) linked to campaigns

audit_events: append-only, hash-chained, no FK deletes cascade into it
```

---

## 2. Tables (full DDL in src/repo/migrate.js)

### users
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4, server-generated |
| username | TEXT UNIQUE NOT NULL | 3–64 chars, alphanumeric+_- |
| password_hash | TEXT NOT NULL | argon2id output |
| role | TEXT NOT NULL | 'admin' \| 'operator' \| 'viewer' |
| is_active | INTEGER | 1=active, 0=disabled |
| failed_login_attempts | INTEGER DEFAULT 0 | resets on success |
| lockout_until | TEXT | ISO timestamp or NULL |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### sessions
Managed by `better-sqlite3-session-store`. Standard express-session table.

### templates
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4 |
| name | TEXT NOT NULL | display name |
| subject | TEXT NOT NULL | email subject |
| sender_name | TEXT NOT NULL | display name in From |
| sender_email | TEXT NOT NULL | From address (fictional) |
| html_body | TEXT NOT NULL | email HTML |
| text_body | TEXT | plain-text version |
| indicator_result | TEXT | JSON blob: last analysis result |
| created_by | TEXT | FK → users.id |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### participants
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4 |
| email | TEXT NOT NULL | participant email |
| display_name | TEXT | optional |
| consent_at | TEXT NOT NULL | ISO timestamp of consent |
| consent_source | TEXT | 'csv_import' \| 'manual' |
| consent_status | TEXT | 'active' \| 'withdrawn' |
| opt_out_at | TEXT | ISO timestamp or NULL |
| created_at | TEXT | ISO timestamp |

### campaigns
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4 |
| name | TEXT NOT NULL | |
| template_id | TEXT | FK → templates.id |
| status | TEXT | 'draft' \| 'sending' \| 'active' \| 'completed' \| 'cancelled' |
| phase | TEXT | 'pre' \| 'post' |
| pre_campaign_id | TEXT | FK → campaigns.id (for post campaigns) |
| send_at | TEXT | scheduled ISO timestamp |
| sent_at | TEXT | actual send ISO timestamp |
| created_by | TEXT | FK → users.id |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### campaign_recipients
One row per (campaign, participant) pair. Holds the per-recipient tracking token.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4 |
| campaign_id | TEXT | FK → campaigns.id |
| participant_id | TEXT | FK → participants.id |
| token | TEXT UNIQUE NOT NULL | 128-bit random hex (server-generated) |
| status | TEXT | 'pending' \| 'sent' \| 'failed' |
| sent_at | TEXT | ISO timestamp |

### events
One row per trackable action. Idempotent insert (token + event_type unique).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4 |
| campaign_recipient_id | TEXT | FK → campaign_recipients.id |
| event_type | TEXT | 'sent' \| 'opened' \| 'clicked' \| 'submitted' \| 'reported' \| 'opted_out' |
| occurred_at | TEXT | ISO timestamp |
| ip_hash | TEXT | SHA-256 of IP, stored only as hash |
| user_agent_trimmed | TEXT | first 200 chars only |
| risk_level | TEXT | 'low' \| 'medium' \| 'high' (from engine) |
| UNIQUE(campaign_recipient_id, event_type) | | prevents duplicate counting |

### lessons
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4 |
| template_id | TEXT | FK → templates.id |
| title | TEXT NOT NULL | |
| content_html | TEXT NOT NULL | lesson body |
| indicators | TEXT | JSON array of red-flag strings named from analysis |
| created_by | TEXT | FK → users.id |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### rules
Versioned thresholds for the security engine. Admin-editable.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4 |
| rule_id | TEXT NOT NULL | stable identifier e.g. 'urgency_language' |
| rule_name | TEXT NOT NULL | human label |
| version | INTEGER NOT NULL | increments on every edit |
| weight | REAL NOT NULL | contribution to risk score |
| threshold | REAL NOT NULL | score above = HIGH risk |
| is_active | INTEGER DEFAULT 1 | 0 = disabled |
| reason_template | TEXT | "Urgency language detected: {match}" |
| created_by | TEXT | FK → users.id |
| updated_at | TEXT | ISO timestamp |
| UNIQUE(rule_id) | | one live row per logical rule |

### results
Stored analysis output for every template analysis and campaign run.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4 |
| entity_type | TEXT | 'template' \| 'campaign' \| 'analytics' |
| entity_id | TEXT | FK to the relevant entity |
| rule_id | TEXT | FK → rules.rule_id |
| rule_name | TEXT | snapshot at time of run |
| rule_version | INTEGER | snapshot |
| engine_version | TEXT | e.g. '1.0.0' |
| weight | REAL | snapshot |
| threshold | REAL | snapshot |
| score | REAL | computed score |
| risk_level | TEXT | 'low' \| 'medium' \| 'high' |
| indicators_matched | TEXT | JSON array of matched indicators with reasons |
| reasons | TEXT | JSON array of human-readable explanations |
| decision | TEXT | 'allow' \| 'warn' \| 'block' |
| created_at | TEXT | ISO timestamp |

### audit_events
Append-only. No UPDATE or DELETE endpoints exist. Hash-chained.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid v4 |
| seq | INTEGER | monotonic sequence |
| actor_id | TEXT | FK → users.id (nullable for system events) |
| actor_role | TEXT | snapshot |
| action | TEXT | see action catalogue below |
| target_type | TEXT | 'user' \| 'template' \| 'campaign' \| 'participant' \| 'rule' \| 'export' \| 'session' \| 'system' |
| target_id | TEXT | entity ID |
| outcome | TEXT | 'success' \| 'failure' \| 'denied' |
| detail | TEXT | JSON blob — PII/secrets redacted |
| request_id | TEXT | from X-Request-Id header |
| ip_hash | TEXT | SHA-256 of client IP |
| prev_hash | TEXT | hash of previous event (chain) |
| hash | TEXT | SHA-256(seq + actor_id + action + target_id + outcome + detail + prev_hash) |
| created_at | TEXT | ISO timestamp |

#### Audit action catalogue
`login.success`, `login.failure`, `login.lockout`, `logout`,
`user.create`, `user.update`, `user.disable`,
`template.create`, `template.update`, `template.delete`, `template.analyze`,
`participant.import`, `participant.optout`,
`campaign.create`, `campaign.send`, `campaign.cancel`,
`event.track` (bulk — not per click for privacy),
`rule.update`,
`export.report`,
`access.denied`,
`system.start`, `system.error`

---

## 3. Role/Permission Matrix

| Action | admin | operator | viewer |
|--------|-------|----------|--------|
| Login / logout | ✓ | ✓ | ✓ |
| View dashboard | ✓ | ✓ | ✓ (restricted) |
| Create/edit templates | ✓ | ✓ | ✗ |
| Delete templates | ✓ | ✗ | ✗ |
| Import participants | ✓ | ✓ | ✗ |
| View participant list | ✓ | ✓ | ✗ |
| Create/send campaign | ✓ | ✓ | ✗ |
| Cancel campaign | ✓ | ✓ | ✗ |
| View campaign results | ✓ | ✓ | ✓ (aggregated, pseudonymised) |
| View raw events | ✓ | ✓ | ✗ |
| View analytics (pre/post) | ✓ | ✓ | ✓ (aggregated) |
| Export report | ✓ | ✓ | ✗ |
| View audit log | ✓ | ✗ | ✗ |
| Manage users | ✓ | ✗ | ✗ |
| Edit rules/thresholds | ✓ | ✗ | ✗ |
| Verify audit chain | ✓ | ✗ | ✗ |

**High-impact actions** (require confirm flag on request + confirmation dialog in UI):
- campaign.send
- participant.import (> 0 rows)
- user.disable
- rule.update

---

## 4. Input Schemas (Zod — also defined in src/api/schemas/)

### Template create/update
```js
{
  name: string, min 3, max 100
  subject: string, min 3, max 200
  sender_name: string, min 1, max 100
  sender_email: string, valid email, fictional domain only (no real providers)
  html_body: string, min 10, max 50_000
  text_body: string optional, max 50_000
}
```

### Participant CSV columns (required)
`email`, `display_name` (optional), `consent_at` (ISO date), `consent_source`

### Campaign create
```js
{
  name: string, min 3, max 100
  template_id: uuid
  phase: 'pre' | 'post'
  pre_campaign_id: uuid (required if phase='post')
  confirm: boolean (must be true to send)
}
```

### Event tracking (server-to-server, via token URL)
Token in URL path; no body.

### Lesson create/update
```js
{
  template_id: uuid
  title: string, min 3, max 200
  content_html: string, min 10, max 100_000
  indicators: string[] max 20 items
}
```

### Rule update (admin only)
```js
{
  weight: number, 0–10
  threshold: number, 0–100
  is_active: boolean
  confirm: boolean (must be true)
}
```

---

## 5. Decision/Result Schema (JSON stored in results table)

```json
{
  "id": "uuid",
  "entity_type": "template",
  "entity_id": "uuid",
  "engine_version": "1.0.0",
  "evaluated_at": "ISO timestamp",
  "rules_applied": [
    {
      "rule_id": "urgency_language",
      "rule_name": "Urgency Language Detector",
      "rule_version": 3,
      "weight": 2.0,
      "threshold": 5.0,
      "score": 2.0,
      "matched": true,
      "indicators": ["URGENT: Act now!", "account will be suspended"],
      "reason": "Urgency language detected: 'URGENT: Act now!' — common phishing pressure tactic"
    }
  ],
  "total_score": 8.5,
  "risk_level": "high",
  "decision": "warn",
  "summary": "Template contains 3 phishing indicators: urgency language, mismatched link, credential request wording."
}
```

---

## 6. Audit Event Format (JSON stored in detail column, PII redacted)

```json
{
  "id": "uuid",
  "seq": 42,
  "actor_id": "uuid-or-null",
  "actor_role": "operator",
  "action": "campaign.send",
  "target_type": "campaign",
  "target_id": "uuid",
  "outcome": "success",
  "detail": {
    "campaign_name": "Q1 Phishing Test",
    "recipient_count": 48,
    "template_id": "uuid"
  },
  "request_id": "req-uuid",
  "ip_hash": "sha256hex",
  "prev_hash": "sha256hex",
  "hash": "sha256hex",
  "created_at": "ISO timestamp"
}
```

Redaction rules (applied before writing):
- Strip any field named `password`, `token`, `secret`, `hash` from detail.
- Truncate `email` values to domain part only: `***@domain.tld`.
- Never write raw IP; write SHA-256(IP + daily_salt).

---

## 7. API Endpoint List

Base path: `/api/v1`

### Auth
| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | /auth/login | public | Login, rate-limited, returns CSRF token |
| POST | /auth/logout | any | Destroy session |
| GET | /auth/me | any | Current user info (no password hash) |

### Templates (FR-1)
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /templates | op+ | List all templates |
| POST | /templates | op+ | Create template + run analysis |
| GET | /templates/:id | op+ | Get template + latest result |
| PUT | /templates/:id | op+ | Update template + re-run analysis |
| DELETE | /templates/:id | admin | Delete template |
| POST | /templates/:id/analyze | op+ | Re-run analysis only |

### Participants (FR-2)
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /participants | op+ | List (email domain only for viewer) |
| POST | /participants/import | op+ | CSV upload, multipart/form-data, confirm required |
| GET | /participants/:id | op+ | Single participant |
| DELETE | /participants/:id | admin | Remove participant |

### Campaigns
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /campaigns | op+ | List campaigns |
| POST | /campaigns | op+ | Create campaign (draft) |
| GET | /campaigns/:id | op+ | Campaign detail |
| POST | /campaigns/:id/send | op+ | Send — confirm=true required |
| POST | /campaigns/:id/cancel | op+ | Cancel active campaign |

### Tracking (FR-3, FR-4) — no auth, token-authenticated
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /t/o/:token | public | Open pixel (1×1 gif) |
| GET | /t/c/:token | public | Click → record event → redirect to landing page |
| GET | /landing/:token | public | Simulated landing page |
| POST | /t/s/:token | public | Form submit (body discarded) → record 'submitted' → redirect to lesson |
| GET | /t/r/:token | public | Report-phish → record 'reported' |
| GET | /t/x/:token | public | Opt-out |

### Lessons (FR-5)
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /lessons | op+ | List lessons |
| POST | /lessons | op+ | Create lesson |
| GET | /lessons/:id | op+ | Get lesson |
| PUT | /lessons/:id | op+ | Update lesson |
| GET | /lessons/by-template/:templateId | public | Lesson for landing page (no PII) |

### Analytics (FR-6)
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /analytics/campaign/:id | op+ | Campaign event summary |
| GET | /analytics/prepost/:preCampaignId/:postCampaignId | op+ | Pre/post comparison |

### Results
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /results | op+ | List results (filterable) |
| GET | /results/:id | op+ | Single result with full evidence |

### Reports
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /reports/campaign/:id | op+ | Download sanitized report (CSV + HTML) |

### Admin
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /admin/users | admin | List users |
| POST | /admin/users | admin | Create user |
| PUT | /admin/users/:id | admin | Update user (role, active) — confirm required |
| GET | /admin/rules | admin | List rules |
| PUT | /admin/rules/:id | admin | Update rule threshold — confirm required |
| GET | /admin/audit | admin | Paginated audit log |
| GET | /admin/audit/verify | admin | Verify hash chain, returns ok/tampered |

### Health
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /health | public | `{status: "ok", uptime, db: "ok"}` |

---

## 8. Stable Error Code Catalogue

| Code | HTTP | Meaning |
|------|------|---------|
| E_VALIDATION | 400 | Input failed schema validation; `fields` array provided |
| E_AUTH | 401 | Not authenticated |
| E_FORBIDDEN | 403 | Authenticated but insufficient role |
| E_NOT_FOUND | 404 | Resource not found (generic, no detail for protected resources) |
| E_CONFLICT | 409 | Duplicate resource (e.g. username taken) |
| E_RATE_LIMIT | 429 | Too many requests; `retry_after` seconds provided |
| E_FILE | 400 | File upload error (type/size/structure) |
| E_CONSENT | 422 | Participant lacks consent or has opted out |
| E_CAMPAIGN_STATE | 422 | Campaign not in required state for this action |
| E_CONFIRM | 422 | High-impact action requires `confirm: true` |
| E_INTERNAL | 500 | Internal server error (no detail exposed) |

Response shape:
```json
{
  "error": {
    "code": "E_VALIDATION",
    "message": "Input validation failed",
    "fields": [{"field": "email", "message": "Must be a valid email address"}]
  }
}
```

---

## 9. Secrets and Config Plan

All secrets via environment variables in `.env` (never committed).

| Secret | Variable | Notes |
|--------|----------|-------|
| Session signing key | SESSION_SECRET | 64-byte random hex |
| DB path | DB_PATH | default ./data/breachcoach.db |
| SMTP config | SMTP_HOST, SMTP_PORT, SMTP_FROM | MailHog only |
| App base URL | APP_BASE_URL | for tracking link generation |

Config is loaded once at startup in `src/config/index.js` which validates all required vars are present and throws if not (fail-fast, not silent).

---

## 10. Ambiguities Found & Resolutions

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Proposal says "CSRF protection when cookie sessions are used" — csurf is deprecated in express ecosystem | Will use `csrf-csrf` or implement double-submit cookie pattern manually. Checking before Phase 2 implementation. |
| 2 | Proposal says "sessions or JWT" — build prompt says express-session + SQLite store | Using express-session + better-sqlite3-session-store as per build prompt. JWT not needed. |
| 3 | The xlsx has 12 threats; the proposal says "at least 8 threats mapped to mitigations" — no conflict | We implement all 12. |
| 4 | Viewer role: proposal says "restricted results... exposed to end users" — unclear if viewer sees lesson pages | Viewer sees aggregated campaign results only. Lesson page is public (token-auth). No conflict. |
| 5 | "Formula prefix rejection" for CSV (TH2) — covers `=`, `+`, `-`, `@` as per xlsx | Implemented in CSV parser middleware. |
| 6 | Pre/post comparison requires two separate campaigns linked by `pre_campaign_id` | Captured in schema. The build prompt and proposal agree on this. |
