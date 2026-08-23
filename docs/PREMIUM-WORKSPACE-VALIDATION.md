# Premium Workspace Validation

## Production audit used for visual verification

The production workspace was verified using the persisted PhotoRoom audit `25e723b5-24db-4970-a5a8-24030e16c507`. The check used the same saved audit record across routes; no test records, synthetic scores, or fabricated trends were added.

| Route | Verified real-data behavior |
| --- | --- |
| `/audit/25e723b5-24db-4970-a5a8-24030e16c507/overview` | Displays the 78/100 score gauge, 56/77 coverage, category score bars, severity-colored counts, and the four highest-priority persisted issues. |
| `/audit/25e723b5-24db-4970-a5a8-24030e16c507/issues` | Displays a single consolidated severity control, category select, search input, priority/category sort, expandable real issues, and retained locator actions. |
| `/audit/25e723b5-24db-4970-a5a8-24030e16c507/headings` | Displays 43 persisted headings, counted compact filters only for captured levels, color-coded H1–H4 hierarchy tags, character counts, question indicators, and locator actions. |
| `/audit/25e723b5-24db-4970-a5a8-24030e16c507/performance` | Preserves the real `LIVE` source label. Because the audit retained no actual Web Vital or score values, it displays an explicit availability explanation instead of invented performance data. |
| `/audit/25e723b5-24db-4970-a5a8-24030e16c507/images` | Displays 50 captured image records, the real 12% ALT coverage bar, one missing-ALT finding, one broken finding, 42 responsive records, 37 records missing dimensions, source URLs, and retained locator actions. |
| `/audit/25e723b5-24db-4970-a5a8-24030e16c507/links` | Displays 134 captured links with real internal/external, no-follow, and empty-anchor counts; retained anchor, destination, rel, and locator evidence remains searchable. |
| `/audit/25e723b5-24db-4970-a5a8-24030e16c507/schema` | Displays four retained JSON-LD blocks, eight detected schema types, four valid blocks, zero invalid blocks, source-grounded type chips, and expandable captured JSON evidence. |

## Live event behavior

The 5.5.3 extension package emits limited official-origin workspace events after pairing, audit save, re-scan, and disconnect. The SaaS revalidates authenticated audit history and connection state, opens the new audit when an event provides its real audit ID, and performs a lightweight revalidation when a user returns to the visible workspace tab. It does not use a hard browser reload.
