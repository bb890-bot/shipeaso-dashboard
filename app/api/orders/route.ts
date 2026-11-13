import { NextRequest, NextResponse } from "next/server";
import { isShopifyConfigured, loadStores, shopifyFetch } from "@/lib/shopify-multi";
import { GET_ORDERS_QUERY, GET_ORDERS_COUNT_QUERY } from "@/lib/shopify-queries";
import { calculateStateAnalytics, getSampleAnalytics } from "@/lib/order-analytics";
import { ShopifyOrderNode, ShopifyOrdersQueryResponse } from "@/types/shopify";

export const dynamic = "force-dynamic";

const ORDERS_PER_PAGE = 250;
const MAX_PAGES = 40;
const MAX_ORDERS = ORDERS_PER_PAGE * MAX_PAGES;
const CACHE_TTL_MS = 5 * 60 * 1000;
// Protect Shopify's GraphQL cost budget when several dashboards or integrations
// request an incremental refresh at nearly the same time.
const MIN_INCREMENTAL_REFRESH_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 12;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

interface CachedRange {
  orders: ShopifyOrderNode[];
  totalAvailable: number;
  truncated: boolean;
  fetchedAt: number;
}

// Raw orders are cached per date range, not per product: switching the product filter
// re-runs the aggregation over the same orders instead of re-crawling the Shopify API.
const ordersCache = new Map<string, CachedRange>();

function readCache(key: string): CachedRange | undefined {
  const hit = ordersCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) {
    ordersCache.delete(key);
    return undefined;
  }
  return hit;
}

function writeCache(key: string, entry: CachedRange) {
  ordersCache.set(key, entry);
  while (ordersCache.size > MAX_CACHE_ENTRIES) {
    const oldest = ordersCache.keys().next().value;
    if (oldest === undefined) break;
    ordersCache.delete(oldest);
  }
}

function buildShopifyQuery(startDate: string | null, endDate: string | null): string {
  // Timestamps carry the store's local offset (IST) and must be quoted for Shopify's parser.
  const parts: string[] = [];
  if (startDate) {
    const start = startDate.includes("T") ? startDate : `${startDate}T00:00:00+05:30`;
    parts.push(`created_at:>='${start}'`);
  }
  if (endDate) {
    const end = endDate.includes("T") ? endDate : `${endDate}T23:59:59+05:30`;
    parts.push(`created_at:<='${end}'`);
  }
  return parts.join(" ");
}

async function fetchOrdersForRange(shopifyQuery: string, storeId: string): Promise<CachedRange> {
  const countData = await shopifyFetch<{
    ordersCount: { count: number; precision: string };
  }>({ query: GET_ORDERS_COUNT_QUERY, variables: { query: shopifyQuery }, storeId });

  const totalAvailable = countData?.ordersCount?.count ?? 0;

  const orders: ShopifyOrderNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let page = 0;

  while (hasNextPage && page < MAX_PAGES) {
    page++;
    const data: ShopifyOrdersQueryResponse = await shopifyFetch<ShopifyOrdersQueryResponse>({
      query: GET_ORDERS_QUERY,
      variables: { cursor, query: shopifyQuery },
      storeId,
    });

    if (data?.orders?.nodes) {
      orders.push(...data.orders.nodes);
    }

    hasNextPage = data?.orders?.pageInfo?.hasNextPage || false;
    cursor = data?.orders?.pageInfo?.endCursor || null;
  }

  return {
    orders,
    totalAvailable,
    truncated: hasNextPage || totalAvailable > orders.length,
    fetchedAt: Date.now(),
  };
}

/**
 * Refresh a cached range without crawling the entire date range again. Shopify
 * returns newest orders first, so querying from the newest cached timestamp is
 * enough to discover new leads while keeping the scheduled refresh inexpensive.
 * Orders with the same timestamp are de-duplicated by ID during the merge.
 */
async function refreshLatestOrdersForRange(
  shopifyQuery: string,
  cached: CachedRange,
  storeId: string
): Promise<CachedRange> {
  if (cached.orders.length === 0) {
    return fetchOrdersForRange(shopifyQuery, storeId);
  }

  const countData = await shopifyFetch<{
    ordersCount: { count: number; precision: string };
  }>({ query: GET_ORDERS_COUNT_QUERY, variables: { query: shopifyQuery }, storeId });

  const newestCreatedAt = cached.orders.reduce(
    (newest, order) => (order.createdAt > newest ? order.createdAt : newest),
    cached.orders[0].createdAt
  );
  const latestQuery = [shopifyQuery, `created_at:>='${newestCreatedAt}'`]
    .filter(Boolean)
    .join(" ");

  const latestOrders: ShopifyOrderNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let page = 0;

  while (hasNextPage && page < MAX_PAGES) {
    page++;
    const data: ShopifyOrdersQueryResponse = await shopifyFetch<ShopifyOrdersQueryResponse>({
      query: GET_ORDERS_QUERY,
      variables: { cursor, query: latestQuery },
      storeId,
    });

    if (data?.orders?.nodes) {
      latestOrders.push(...data.orders.nodes);
    }

    hasNextPage = data?.orders?.pageInfo?.hasNextPage || false;
    cursor = data?.orders?.pageInfo?.endCursor || null;
  }

  const ordersById = new Map(cached.orders.map((order) => [order.id, order]));
  for (const order of latestOrders) {
    ordersById.set(order.id, order);
  }

  const orders = Array.from(ordersById.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_ORDERS);
  const totalAvailable = countData?.ordersCount?.count ?? orders.length;

  return {
    orders,
    totalAvailable,
    truncated: hasNextPage || totalAvailable > orders.length,
    fetchedAt: Date.now(),
  };
}

async function loadStoreRange(
  storeId: string,
  shopifyQuery: string,
  startDate: string | null,
  endDate: string | null,
  refreshMode: string | null
): Promise<{ range: CachedRange; syncMode: "cache" | "incremental" | "full" }> {
  const cacheKey = `${storeId}|${startDate || "*"}|${endDate || "*"}`;
  let range = readCache(cacheKey);
  let syncMode: "cache" | "incremental" | "full" = "cache";

  if (!range || refreshMode === "full") {
    range = await fetchOrdersForRange(shopifyQuery, storeId);
    writeCache(cacheKey, range);
    syncMode = "full";
  } else if (
    refreshMode === "latest" &&
    Date.now() - range.fetchedAt >= MIN_INCREMENTAL_REFRESH_MS
  ) {
    range = await refreshLatestOrdersForRange(shopifyQuery, range, storeId);
    writeCache(cacheKey, range);
    syncMode = "incremental";
  }
  return { range, syncMode };
}

function namespaceOrder(order: ShopifyOrderNode, storeId: string, storeName: string) {
  return {
    ...order,
    id: `${storeId}:${order.id}`,
    name: `${storeName} / ${order.name}`,
    lineItems: {
      ...order.lineItems,
      nodes: (order.lineItems?.nodes || []).map((item) => ({
        ...item,
        variant: item.variant
          ? {
              ...item.variant,
              product: item.variant.product
                ? {
                    ...item.variant.product,
                    id: `${storeId}:${item.variant.product.id}`,
                    title: `${item.variant.product.title} — ${storeName}`,
                  }
                : item.variant.product,
            }
          : item.variant,
      })),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get("productId") || "all";
    const storeId = searchParams.get("storeId") || "all";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const refreshMode = searchParams.get("refresh");

    const configuredStores = loadStores().filter((store) => isShopifyConfigured(store.id));
    const selectedStores =
      storeId === "all"
        ? configuredStores
        : configuredStores.filter((store) => store.id === storeId);

    if (selectedStores.length === 0) {
      const sample = getSampleAnalytics();
      return NextResponse.json(
        {
          isConfigured: false,
          summary: sample.summary,
          states: sample.states,
          runningProducts: sample.runningProducts || [],
          campaigns: sample.campaigns || [],
          totalCount: sample.summary.totalOrders,
          totalAvailable: sample.summary.totalOrders,
          truncated: false,
          fetchedAt: Date.now(),
          message: "Shopify credentials not configured. Displaying demo analytics.",
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const shopifyQuery = buildShopifyQuery(startDate, endDate);
    const settledRanges = await Promise.allSettled(
      selectedStores.map(async (store) => ({
        store,
        ...(await loadStoreRange(store.id, shopifyQuery, startDate, endDate, refreshMode)),
      }))
    );
    const successfulRanges = settledRanges
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof loadStoreRange>> & { store: typeof selectedStores[number] }> => result.status === "fulfilled")
      .map((result) => result.value);
    const storeErrors = settledRanges.flatMap((result, index) =>
      result.status === "rejected"
        ? [{
            storeId: selectedStores[index].id,
            storeName: selectedStores[index].name,
            error: result.reason?.message || "Store data could not be loaded.",
          }]
        : []
    );

    if (successfulRanges.length === 0) {
      throw new Error(storeErrors.map((item) => `${item.storeName}: ${item.error}`).join(" | "));
    }

    const isCombined = storeId === "all";
    const orders = successfulRanges.flatMap(({ store, range }) =>
      isCombined
        ? range.orders.map((order) => namespaceOrder(order, store.id, store.name))
        : range.orders
    );
    const totalAvailable = successfulRanges.reduce(
      (sum, item) => sum + item.range.totalAvailable,
      0
    );
    const truncated = successfulRanges.some((item) => item.range.truncated);
    const fetchedAt = Math.max(...successfulRanges.map((item) => item.range.fetchedAt));
    const syncMode = successfulRanges.some((item) => item.syncMode === "full")
      ? "full"
      : successfulRanges.some((item) => item.syncMode === "incremental")
        ? "incremental"
        : "cache";

    const { summary, states, runningProducts, campaigns } = calculateStateAnalytics(
      orders,
      productId
    );
    const successfulStoreBreakdown = successfulRanges.map(({ store, range }) => {
      let storeProductId = productId;
      if (isCombined && productId !== "all") {
        const prefix = `${store.id}:`;
        storeProductId = productId.startsWith(prefix)
          ? productId.slice(prefix.length)
          : "__no_matching_product__";
      }
      const storeAnalytics = calculateStateAnalytics(range.orders, storeProductId);
      return {
        storeId: store.id,
        storeName: store.name,
        domain: store.domain || "",
        summary: storeAnalytics.summary,
        ordersAnalyzed: range.orders.length,
        totalAvailable: range.totalAvailable,
        truncated: range.truncated,
      };
    });
    const failedStoreBreakdown = storeErrors.map((item) => ({
      storeId: item.storeId,
      storeName: item.storeName,
      domain: selectedStores.find((store) => store.id === item.storeId)?.domain || "",
      ordersAnalyzed: 0,
      totalAvailable: 0,
      truncated: false,
      error: item.error,
    }));
    const storeBreakdown = selectedStores.map((store) =>
      [...successfulStoreBreakdown, ...failedStoreBreakdown].find(
        (item) => item.storeId === store.id
      )!
    );

    return NextResponse.json(
      {
        isConfigured: true,
        summary,
        states,
        runningProducts,
        campaigns,
        totalCount: orders.length,
        totalAvailable,
        truncated,
        maxOrders: MAX_ORDERS,
        fetchedAt,
        syncMode,
        storeErrors,
        partialData: storeErrors.length > 0,
        storeBreakdown,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: any) {
    console.error("Error fetching or processing Shopify orders:", error);
    const detail = error?.message ? String(error.message) : "Unknown error";
    return NextResponse.json(
      {
        error: `Unable to load Shopify data: ${detail}`,
        isConfigured: isShopifyConfigured(request.nextUrl.searchParams.get("storeId")),
        summary: {
          totalOrders: 0,
          totalUnits: 0,
          totalRevenue: 0,
          currency: "INR",
          topState: "N/A",
        },
        states: [],
        runningProducts: [],
        campaigns: [],
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
