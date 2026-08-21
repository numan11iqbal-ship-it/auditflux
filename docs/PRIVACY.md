# Privacy Policy — AuditFlux SEO

**Last updated:** 20 August 2026

## Summary

This extension does not collect, transmit, store, or sell any data. Everything happens locally in your browser and is discarded when the popup closes.

## What the extension accesses

When you click the extension icon on a web page, it reads that page's HTML — title, meta tags, headings, links, images, and structured data — to produce an SEO audit. It also requests the following files from that website's own server, exactly as your browser would:

- `/robots.txt`
- `/llms.txt` and `/llms-full.txt`
- `/sitemap.xml`, `/sitemap_index.xml`, and any sitemap declared in robots.txt

It also refetches the current URL itself, which is how it reads the page's real response headers (such as Content-Security-Policy) and the HTML your server actually sent for the source viewer.

It accesses a page only when you click the extension icon on that page. It does not run in the background or on pages you have not explicitly audited.

## What the extension does with it

The audit is calculated in the popup and shown to you. Nothing is uploaded anywhere. The extension has no server, no analytics, no telemetry, no error reporting, no advertising, and no third-party services of any kind.

Results exist only while the popup is open. Closing it discards them. Nothing is written to disk except files you explicitly export yourself using the "Export CSV" button, which are saved by Chrome to your own downloads folder.

## Performance and resource data

AuditFlux SEO reads timing and resource information for the page you audit from your browser's own Performance APIs. This describes how that page loaded for you and is shown only to you. It is not transmitted anywhere and is discarded when the report closes.

## Data sharing

None. No data is transmitted off your device, so there is nothing to share, sell, or disclose.

## Permissions and why they are needed

- **`activeTab`** — allows reading the current tab when you click the icon. It grants no standing access to any website and expires with the interaction.
- **`scripting`** — allows injecting the analysis script and the heading overlay into the tab you are auditing.
- **`storage`** — stores the most recent audit locally on your device so the full report page can display it without re-analyzing. It is overwritten by each new scan and never leaves your browser.

The extension requests no host permissions and runs no background service worker.

## Changes

Any future change to this policy will be published with a new version of the extension.

## Contact

Questions about this policy can be sent to the developer contact listed on the extension's Chrome Web Store page.
