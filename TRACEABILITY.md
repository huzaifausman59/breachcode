# TRACEABILITY.md — BreachCoach Requirement → Code → Test → Evidence

| Req | Description | Code | Test | Evidence |
|-----|-------------|------|------|----------|
| FR-1 | Campaign templates | src/services/templates.js, src/api/routes/templates.js | tests/api/templates.test.js | docs/evidence/T_FR1_* |
| FR-2 | Consented participant list | src/services/participants.js, src/api/routes/participants.js | tests/api/participants.test.js | docs/evidence/T_FR2_* |
| FR-3 | Simulated landing pages | src/services/landing.js, src/api/routes/track.js | tests/api/landing.test.js | docs/evidence/T1_* |
| FR-4 | Event tracking | src/services/events.js, src/api/routes/track.js | tests/api/events.test.js | docs/evidence/T4_* |
| FR-5 | Micro-lessons | src/services/lessons.js, src/api/routes/lessons.js | tests/api/lessons.test.js | docs/evidence/T_FR5_* |
| FR-6 | Pre/post analytics | src/services/analytics.js, src/api/routes/analytics.js | tests/api/analytics.test.js | docs/evidence/T6_* |
| TH1 | No credential storage | src/api/routes/track.js (discard pw fields) | tests/security/no-credentials.test.js | docs/evidence/T1_* |
| TH2 | Malicious/oversized CSV | src/api/routes/participants.js, multer config | tests/security/upload.test.js | docs/evidence/Tfinal_a_* |
| TH3 | SQL injection | src/repo/* (parameterized queries) | tests/security/sqli.test.js | docs/evidence/Tfinal_a_* |
| TH4 | CSRF | src/security/auth/csrf.js | tests/security/csrf.test.js | docs/evidence/security_* |
| TH5 | Session hijack/fixation | src/security/auth/session.js | tests/security/session.test.js | docs/evidence/security_* |
| TH6 | Privilege escalation | src/security/auth/rbac.js | tests/security/rbac.test.js | docs/evidence/Tfinal_b_* |
| TH7 | Audit tampering | src/security/audit/log.js (hash chain) | tests/security/audit-chain.test.js | docs/evidence/T3_* |
| TH8 | PII in logs | src/security/audit/redact.js | tests/security/redaction.test.js | docs/evidence/T3_* |
| TH9 | Brute-force login | src/security/auth/rateLimiter.js | tests/security/brute-force.test.js | docs/evidence/security_* |
| TH10 | Guessable tracking links | src/services/campaigns.js (uuid tokens) | tests/security/tokens.test.js | docs/evidence/T4_* |
| TH11 | Emails to non-consented | src/mail/sender.js (consent check) | tests/security/mail-consent.test.js | docs/evidence/T2_* |
| TH12 | Secrets in exports | src/services/reports.js (sanitize) | tests/security/export.test.js | docs/evidence/T3_* |
| T1 | No credential collection | (see TH1) | tests/security/no-credentials.test.js | docs/evidence/T1_* |
| T2 | Opt-out flow | src/api/routes/track.js (opt-out) | tests/api/optout.test.js | docs/evidence/T2_* |
| T3 | Privacy controls | src/security/audit/, src/services/reports.js | tests/security/privacy.test.js | docs/evidence/T3_* |
| T4 | Event accuracy | src/services/events.js (idempotent) | tests/api/events.test.js | docs/evidence/T4_* |
| T5 | Accessibility | src/web/ (semantic HTML) | tests/accessibility/ | docs/evidence/T5_lighthouse.html |
| T6 | Pre/post learning | src/services/analytics.js | tests/api/analytics.test.js | docs/evidence/T6_* |
| T-final a | Malformed/oversized input | multer, zod, csv-parse | tests/security/upload.test.js | docs/evidence/Tfinal_a_* |
| T-final b | Unauthorized request | RBAC middleware | tests/security/rbac.test.js | docs/evidence/Tfinal_b_* |
| T-final c | Repeated submission | rate limiting, idempotency | tests/security/repeated.test.js | docs/evidence/Tfinal_c_* |
| T-final d | Safe failure + recovery | migration, audit chain verify | tests/e2e/recovery.test.js | docs/evidence/Tfinal_d_* |
