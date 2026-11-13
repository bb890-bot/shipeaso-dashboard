# Shipeaso — Product × State CSV report patch

## Included

- `/reports` page with **State-wise Product Matrix** selected by default.
- Alternative Product-wise State Breakdown CSV.
- Orders / Units / Revenue selection (matrix). Breakdown exports all three metrics.
- All configured Shopify stores, optional date range.
- Bulk Shopify GraphQL API start → poll status → download, without a 10,000-order cap in the **export path**.
- Stream-processing of the JSONL source (the CSV itself is assembled in memory).
- Indian province normalization; product-order counts are per product (one order can contribute to multiple products).

## Installation

Copy the `app`, `components`, and `lib` files into the existing Next.js repository, preserving paths.
Do **not** overwrite unrelated existing files. Visit `/reports`. Optionally add a navigation link to `/reports` on your dashboard page.

Use `npm install` followed by `npm run build` in your original repository.

This package has not been built against the full original repository because direct repository access was unavailable. The isolated aggregation module passed the included smoke tests.

## Shopify requirements

- App scopes: `read_orders` and `read_products`; for older orders Shopify may require `read_all_orders` approval.
- Shopify API 2026-10 configured in original app.
- Partner-built apps may now need separate permission to run bulk queries (new Shopify rule of 2026-11-06).
- Start a report, periodically click Check status, then Download CSV.
- Bulk download URLs are short-lived; export soon after completion.

## Limitations and next steps

1. The existing `/api/orders` dashboard still has the 40-page / 10,000-order limit. This patch adds an uncapped **report export**, it does not alter existing dashboard analytics. The existing cap should be removed only after adopting a background sync + persistent storage design; simply raising it risks function timeouts.
2. A very large report might exceed a Vercel request duration or memory limit during CSV generation. For production-scale exports, move JSONL processing to a background worker and store aggregates in a persistent DB or object storage.
3. Cross-store revenue is summed in shop currency without FX conversion. Only combine revenue when both stores have the same currency; otherwise choose an individual store (extend the UI to fetch real store IDs).
4. The current UI defaults to All configured stores because the original store IDs aren't known without full repository access. The endpoint supports `storeId` for integrating the existing store picker.
5. Export route is currently accessible on the same basis as existing API routes. Apply your app authentication / authorization middleware before exposing sensitive order insights to the public internet.
6. Orders with missing Indian shipping province appear as `Unknown`; non-Indian shipping destinations are excluded.
7. When Shopify returns a bulk operation failure, the status reports FAILED (rather than exporting partial data).
8. The UI uses explicit status checks instead of auto-polling; this avoids unnecessary requests.

## Definitions

- `Orders` = distinct Shopify orders containing the product within a state, not total order count across all products.
- `Units` = sum of line item quantities.
- `Revenue` = line-item discounted total in Shopify shop currency; refunds/cancellations not deducted separately.
- Product column labels include store name and product ID to prevent accidental cross-store merging.
- `Total` in a matrix is the sum across product cells, so it may exceed distinct Shopify order count.

## Verification

The isolated report aggregator passed a 2-state, 2-product, 3-order smoke test with non-Indian data excluded.

Run the test with Node and TypeScript installed:

```bash
tsc --target ES2022 --module CommonJS --outDir .test-build lib/state-report.ts
cp .test-build/state-report.js .test-build/state-report.cjs
node tests/report-smoke.mjs
```
