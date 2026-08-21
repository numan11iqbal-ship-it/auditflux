# Chrome Web Store policy audit — AuditFlux SEO v4.0.0

Reviewed against current Chrome Web Store program policies.

## Single purpose
**Compliant.** One purpose: analyze the SEO characteristics of the page the user is viewing and present the results. Every surface — popup, full report, heading overlay, source viewer — serves that purpose.

## Permissions
| Permission | Why | Narrowest option? |
|---|---|---|
| `activeTab` | Read the DOM of the page the user chooses to audit. Granted only on icon click, only for that page, expires with the interaction. | Yes — avoids host permissions entirely |
| `scripting` | Inject the analyzer and heading overlay into that tab. | Yes — required for `executeScript` |
| `storage` | Persist the latest audit locally so the full report page can display it without re-analyzing. | Yes — `storage`, not `unlimitedStorage` |

**No required host permissions. No `<all_urls>`. No background service worker.** The extension cannot run on any page the user has not explicitly clicked it on.

**Optional host permissions (v4):** `https://www.googleapis.com/*` and `https://chromeuxreport.googleapis.com/*`. These are declared as *optional* and requested at runtime the first time a user runs PageSpeed or queries CrUX — the extension installs with no host access at all. Both are first-party Google APIs used for performance data only.

## Remote code
**Compliant.** No `eval`, no `new Function`, no remotely hosted scripts, no CDN dependencies. All code ships in the package. An explicit CSP (`script-src 'self'; object-src 'self'`) is declared for extension pages.

Network requests are limited to the audited page's own origin: `/robots.txt`, `/llms.txt`, `/llms-full.txt`, sitemaps, and a refetch of the current URL to read response headers. All are data fetches; nothing fetched is ever executed.

## User data
**Compliant.** No collection, transmission, or storage off-device. No analytics, telemetry, error reporting, accounts, or third-party services. The single stored object is the latest audit in `chrome.storage.local`, overwritten each scan.

Privacy tab answers: leave every data-usage category unchecked, and certify all three disclosures (no sale/transfer, no unrelated use, no creditworthiness use).

## Content injection
The heading overlay is the only thing written to a page. It:
- appends one namespaced container to `<body>` and one `<style>` element,
- never modifies, restyles or reorders page content,
- is `pointer-events: none`, so it cannot intercept clicks,
- removes itself completely on toggle off, including listeners and observers.

Covered by tests asserting heading markup and body text are byte-identical after a full toggle cycle.

## Misleading behaviour
**Compliant.** No fake data, no simulated integrations, no non-functional controls. Where a value cannot be determined it is reported as unavailable — if robots.txt cannot be read, AI crawler access is shown as unknown, never as allowed. Capability limits are stated in the listing.

## Security
Every value taken from the audited page is HTML-escaped before rendering, including page title, meta description, headings, anchor text, image alt, and the HTML source viewer. Covered by an XSS suite that feeds hostile markup through each of these paths.

## Branding (v3.0.0)
Product name is **AuditFlux SEO** throughout: manifest `name` and `short_name`, popup and dashboard headers, report output, privacy policy and documentation. The icon set (16/32/48/128, plus a 1024 master and a multi-size `favicon.ico`) is generated from the supplied logo with no redesign — scaling only.

## Monetisation disclosure (v4)
The extension is free to install. A pricing page describes Free, Pro and Agency tiers, but **no payment processing is connected** and no plan can be purchased. Every upgrade control states this plainly rather than implying a purchase flow exists. Nothing is described as "100% free" while advanced functionality is planned as paid.

## Outstanding before submission
1. **Real-browser testing.** Automated tests cover logic and rendering under jsdom; they do not exercise Chrome itself. Load unpacked and test on real sites first. This matters more in v3, because the new performance and resource data comes from Performance APIs that jsdom does not implement — that code path has never executed against a real timeline.
2. **Screenshots.** At least one 1280×800 image, taken from the real extension.
3. **Hosted privacy policy.** `PRIVACY.md` needs a public URL.
4. **Live API calls are unverified.** PageSpeed and CrUX request/response handling is covered by tests against fixtures shaped like real API responses, but no live call to googleapis.com has been made from this environment. The first real run must be done in Chrome.
5. **Icon legibility at 16px.** The supplied logo is a detailed illustration; at toolbar size the individual elements are not separable. The brief forbids redesigning it, so it ships faithfully scaled. A simplified small-size mark would need your approval since it would alter the artwork.

## Verdict
No known policy blockers. Technically ready for submission **after** the three items above are completed. It is not "ready" until real-browser testing has been done.
