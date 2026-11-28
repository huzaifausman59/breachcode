# UI Evidence Index (Phase 5)

Screenshots are kept locally and attached to the final report (`docs/evidence/*.png` is git-ignored).

| File | Requirement | What it shows |
|---|---|---|
| FR1_templates_list.png | FR-1 | Normal template -> LOW/allow; phishing template -> HIGH/block |
| FR1_high_result_top.png, FR1_high_result_bottom.png | FR-1 | Explainable result: score 11.0, 5 rules, each indicator with its reason |
| FR1_low_result.png | FR-1 | Normal sample: score 0.0, no unjustified warning |
| FR2_T3_import_result.png | FR-2, T3, T-final | CSV import: 3 imported, 2 skipped (missing consent fields; formula prefix rejected) |
| FR2_participants_table.png | FR-2 | Only consented participants stored, status Active |

Known issues found: result modal shows 'Evaluated: -' (created_at field mismatch); CSV with UTF-8 BOM header is rejected (csv-parse needs bom:true).
