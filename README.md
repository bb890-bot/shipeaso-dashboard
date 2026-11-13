# Shopify Order Analytics Dashboard

A simple, fast, and responsive **Shopify Order Analytics Dashboard** built with **Next.js (App Router) + TypeScript + Tailwind CSS** designed specifically to answer:

> **"For this Shopify product, how many orders and units came from each Indian state during this date range?"**

---

## Features

- **Product-wise State Breakdown**: Filter by individual product or view store-wide metrics across all products.
- **Indian State Aggregation**: Analyzes shipping addresses (`province` / `provinceCode` where `countryCodeV2 === 'IN'`) with canonical Indian state name normalization.
- **Metrics at a Glance**:
  - **Orders**: Count of unique Shopify orders containing the product.
  - **Units**: Sum of line-item quantities sold.
  - **Revenue**: Product-specific line item revenue formatted in Indian Rupees (₹).
  - **Top State**: Automatically identifies the leading delivery state.
- **Date Range Filters**: Custom date picker with one-click presets (*Today*, *Last 7 Days*, *Last 30 Days*, *This Month*).
- **Interactive State Search & Sorting**: Real-time state filter and sorting by State name, Orders, Units, or Revenue.
- **Cursor-Based GraphQL Pagination**: Efficiently fetches Shopify orders across multiple pages on the server side.
- **Zero Client Credential Exposure**: All Shopify Admin API calls and tokens stay strictly on the server.
- **Two-store Dashboard**: Connect up to two Shopify stores, switch between them, or use **All Stores (Combined)** for one consolidated report.
- **Fault-tolerant Combined View**: If one store is temporarily unavailable, data from the healthy store remains visible with a partial-data warning.

---

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Data Source**: Shopify Admin GraphQL API

---

## Getting Started

### 1. Clone & Install Dependencies

```bash
cd Shopify-orderDashboard
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local
```

Populate the variables:

```env
# Store 1
SHOPIFY_STORE_NAME=Main Store
SHOPIFY_STORE_DOMAIN=first-store.myshopify.com
SHOPIFY_CLIENT_ID=your_first_store_client_id
SHOPIFY_CLIENT_SECRET=your_first_store_client_secret

# Store 2
SHOPIFY_STORE_NAME_2=Second Store
SHOPIFY_DOMAIN=second-store.myshopify.com
SHOPIFY_CLIENT_ID_2=your_second_store_client_id
SHOPIFY_CLIENT_SECRET_2=your_second_store_client_secret

SHOPIFY_API_VERSION=2026-10
```

Environment variables are the source of truth locally and on Vercel. When these
variables are present, the dashboard shows both connections as read-only and does
not try to overwrite them with `shopify-config.json`. After both are configured, the
header selector provides **All Stores (Combined)** plus a separate option for each
store.

Use the exact variable names above in **Vercel → Project Settings → Environment
Variables**, enable them for Production (and Preview if required), and redeploy after
any change. Do not include spaces before or after a variable name.

---

## Shopify Setup Guide (Obtaining API Credentials)

### Order period endpoints

The dashboard exposes convenience endpoints for common Asia/Kolkata reporting periods. They return the same analytics payload as `/api/orders` and accept the same optional `storeId`, `productId`, and `refresh` query parameters:

- `GET /api/orders/today`
- `GET /api/orders/yesterday`
- `GET /api/orders/this-month`

`this-month` covers the first day of the current month through today.

These three endpoints request an incremental update by default. Upstream Shopify
refreshes are limited to once per minute per store and date range, while requests
inside that window reuse the in-memory cache. Pass `refresh=full` only when a
complete re-sync is required.

The settings form uses Shopify's current **Dev Dashboard client credentials** flow:

1. Open the [Shopify Dev Dashboard](https://dev.shopify.com/dashboard) and select the
   organization that owns the store.
2. Open **Apps**, create an app named `Order Analytics Dashboard`, and create an app
   version with `read_orders` and `read_products` scopes.
3. Install the app on the target store from the app's **Installs** card.
4. Open the app's **Settings** page. Under **Credentials**, copy the **Client ID** and
   **Client secret**.
5. In this dashboard, open **Settings**, enter the store's permanent
   `your-store.myshopify.com` domain and those credentials, then click **Save & verify**.
6. Repeat for the second store. If it belongs to a different Shopify organization,
   create/install the app in that organization and use that app's credentials.

The dashboard exchanges these credentials server-side for a short-lived access token
and refreshes it automatically. An older `SHOPIFY_ACCESS_TOKEN` in `.env.local` remains
supported only as a legacy first-store configuration.

### Credentials used by the in-dashboard connection form

For each store, enter:

- **Store name**: Any friendly label, such as `Main Store`.
- **Store domain**: Found in Shopify Admin under **Settings → Domains**; use the
  permanent `your-store.myshopify.com` domain.
- **Client ID** and **Client secret**: In the Shopify **Dev Dashboard**, open the app,
  then go to **Settings → Credentials**.
- **API version**: Keep the latest version selected in the dashboard unless the app
  is intentionally pinned to an older supported version.

The app needs the `read_orders` and `read_products` Admin API scopes and must be
installed on each store. Add `read_all_orders` only if Shopify has approved access and
you need orders older than 60 days. Never commit `.env.local` or
`shopify-config.json`; both are excluded by this repository's `.gitignore`.

---

## Campaign Attribution (Campaign ID → State)

The **Campaign-wise Breakdown** table groups orders by ad campaign ID. Expanding a campaign row shows which states that campaign's orders came from.

### Where the campaign ID comes from

The dashboard reads campaign attribution from two sources, in priority order:

1. **Order custom attributes** (primary). COD form apps such as **EasySell COD Form** create orders through the API and copy the landing page's UTM parameters onto the order as attributes. The keys used are `utm_campaign` (falling back to `utm_id`, then `campaign_id`), plus `utm_source`, `utm_medium` and `utm_content`. With Meta ads these hold numeric IDs:

   | Attribute | Meaning |
   | --- | --- |
   | `utm_campaign` / `utm_id` | Campaign ID (e.g. `120253491168280721`) |
   | `utm_content` | Ad ID |
   | `utm_term` | Ad set ID |
   | `utm_source` | `fb` / `ig` |
   | `utm_medium` | `paid` |

2. **`customerJourneySummary`** (fallback), used for orders placed through the normal web checkout, where Shopify itself records the visit and its UTM parameters.

Orders with no attribution from either source are grouped under **"Direct / No Campaign"**.

> **Note:** orders created by a COD form app never have `customerJourneySummary` data — Shopify records no storefront visit for an API-created order, so `momentsCount` is `0` and `firstVisit`/`lastVisit` are `null`. This is expected and is why the custom attributes are the primary source.

For campaign data to populate, your ad links must carry UTM parameters. In Meta Ads Manager, use dynamic URL parameters on the ad's website URL:

```
utm_source=fb&utm_medium=paid&utm_id={{campaign.id}}&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}
```

---

## Development & Production Commands

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Production Build

```bash
npm run build
npm run start
```

---

## Project Structure

```text
Shopify-orderDashboard/
├── app/
│   ├── api/
│   │   ├── orders/
│   │   │   └── route.ts          # Server route handler for fetching & aggregating orders
│   │   └── products/
│   │       └── route.ts          # Server route handler for fetching product catalog
│   ├── globals.css               # Clean Tailwind design tokens
│   ├── layout.tsx                # App layout & SEO metadata
│   └── page.tsx                  # Dashboard page
├── components/
│   └── dashboard/
│       ├── Dashboard.tsx         # Main dashboard orchestrator
│       ├── Header.tsx            # Header with live connection status
│       ├── StatsCards.tsx        # 4 summary metrics cards
│       ├── ProductSelector.tsx   # Product dropdown selector
│       ├── DateRangeFilter.tsx   # Date pickers & quick presets
│       ├── StateOrdersTable.tsx  # Sortable & searchable state table
│       └── SkeletonLoaders.tsx   # Skeletons for card & table loading states
├── lib/
│   ├── shopify.ts                # Server-only GraphQL client
│   ├── shopify-queries.ts        # Typed GraphQL queries
│   ├── order-analytics.ts        # Business logic: state normalization & metrics calculation
│   └── formatters.ts             # Indian currency (₹) & date formatting utilities
├── types/
│   └── shopify.ts                # TypeScript types & interfaces
├── .env.local.example            # Environment variables template
├── package.json
└── README.md
```

---

## License

MIT License.
