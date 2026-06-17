#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";
const OUTPUT_FILE = resolve(process.env.OPENAI_DASHBOARD_OUTPUT || "dashboard/dashboard-data.js");
const FEED_FILE = resolve(process.env.OPENAI_FEED_OUTPUT || "exports/openai-products.jsonl.gz");
const DAYS = Number(process.env.OPENAI_DASHBOARD_DAYS || 30);
const UTM_SOURCE = (process.env.OPENAI_DASHBOARD_UTM_SOURCE || "openai").toLowerCase();
const MANUAL_SPEND = Number(process.env.OPENAI_AD_SPEND || 0);

const ORDERS_QUERY = `
  query OpenAIOrders($cursor: String, $query: String!) {
    orders(first: 100, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customerJourneySummary {
          firstVisit {
            landingPage
            utmParameters {
              source
              medium
              campaign
              content
              term
            }
          }
          lastVisit {
            landingPage
            utmParameters {
              source
              medium
              campaign
              content
              term
            }
          }
        }
        lineItems(first: 25) {
          nodes {
            title
            sku
            quantity
            discountedTotalSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            variant {
              id
              sku
              product {
                id
                title
                handle
              }
            }
          }
        }
      }
    }
  }
`;

async function main() {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }

  assertEnv();
  const feed = readFeed(FEED_FILE);
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const orders = await fetchOrders(`created_at:>=${since.toISOString().slice(0, 10)}`);
  const openaiOrders = orders.filter(isOpenAIOrder);
  const dashboard = buildDashboard({ feed, orders: openaiOrders, allFetchedOrders: orders, since });

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, `window.OPENAI_DASHBOARD_DATA = ${JSON.stringify(dashboard, null, 2)};\n`);

  console.log(`Fetched ${orders.length} Shopify orders from the last ${DAYS} days.`);
  console.log(`Matched ${openaiOrders.length} orders with utm_source=${UTM_SOURCE}.`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}

async function fetchOrders(query) {
  let cursor = null;
  const orders = [];

  do {
    const data = await shopifyGraphql(ORDERS_QUERY, { cursor, query });
    const connection = data.orders;
    orders.push(...connection.nodes);
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    process.stderr.write(`Fetched ${orders.length} orders\r`);
  } while (cursor);

  process.stderr.write("\n");
  return orders;
}

async function shopifyGraphql(query, variables) {
  const shop = normalizeShop(process.env.SHOPIFY_SHOP);
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json();
  if (!response.ok || body.errors) {
    const text = JSON.stringify(body.errors || body);
    if (/access denied|read_orders|scope/i.test(text)) {
      throw new Error(
        `Shopify rejected the orders query. Reauthorize with: $env:SHOPIFY_SCOPES = "read_products,read_orders" then rerun get-shopify-oauth-token.mjs. Details: ${text}`,
      );
    }
    throw new Error(`Shopify GraphQL failed: ${text}`);
  }

  return body.data;
}

function buildDashboard({ feed, orders, allFetchedOrders, since }) {
  const currency = orders[0]?.totalPriceSet?.shopMoney?.currencyCode || "USD";
  const revenue = sum(orders.map((order) => money(order.totalPriceSet?.shopMoney?.amount)));
  const orderCount = orders.length;
  const itemCount = sum(orders.flatMap((order) => order.lineItems.nodes.map((item) => item.quantity || 0)));
  const roas = MANUAL_SPEND > 0 ? revenue / MANUAL_SPEND : null;

  const byDay = new Map();
  const byCampaign = new Map();
  const byProduct = new Map();
  const byCategory = new Map();

  for (const order of orders) {
    const utm = orderUtm(order);
    const day = order.createdAt.slice(0, 10);
    addMetric(byDay, day, money(order.totalPriceSet?.shopMoney?.amount), 1);
    addMetric(byCampaign, utm.campaign || "(missing campaign)", money(order.totalPriceSet?.shopMoney?.amount), 1);

    for (const item of order.lineItems.nodes) {
      const key = item.sku || item.variant?.sku || item.title;
      const feedRow = feed.get(key);
      const itemRevenue = money(item.discountedTotalSet?.shopMoney?.amount);
      addMetric(byProduct, key, itemRevenue, item.quantity || 0, {
        title: item.title,
        category: feedRow?.product_category || "Uncategorized",
      });
      addMetric(byCategory, feedRow?.product_category || "Uncategorized", itemRevenue, item.quantity || 0);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    window_days: DAYS,
    since: since.toISOString(),
    utm_source: UTM_SOURCE,
    currency,
    totals: {
      orders: orderCount,
      revenue,
      items: itemCount,
      average_order_value: orderCount ? revenue / orderCount : 0,
      manual_spend: MANUAL_SPEND,
      roas,
      fetched_orders: allFetchedOrders.length,
    },
    by_day: sortedMetrics(byDay, "key", "asc"),
    by_campaign: sortedMetrics(byCampaign),
    by_product: sortedMetrics(byProduct).slice(0, 50),
    by_category: sortedMetrics(byCategory).slice(0, 50),
    recent_orders: orders.slice(0, 50).map((order) => ({
      name: order.name,
      created_at: order.createdAt,
      status: order.displayFinancialStatus,
      revenue: money(order.totalPriceSet?.shopMoney?.amount),
      utm: orderUtm(order),
      landing_page: order.customerJourneySummary?.lastVisit?.landingPage || order.customerJourneySummary?.firstVisit?.landingPage || "",
    })),
  };
}

function readFeed(file) {
  const rows = gunzipSync(readFileSync(file)).toString("utf8").trim().split(/\n/).map((line) => JSON.parse(line));
  const bySku = new Map();
  for (const row of rows) {
    bySku.set(row.item_id, row);
  }
  return bySku;
}

function isOpenAIOrder(order) {
  const utm = orderUtm(order);
  const landing = `${order.customerJourneySummary?.firstVisit?.landingPage || ""} ${order.customerJourneySummary?.lastVisit?.landingPage || ""}`.toLowerCase();
  return utm.source === UTM_SOURCE || landing.includes(`utm_source=${UTM_SOURCE}`);
}

function orderUtm(order) {
  const first = normalizeUtm(order.customerJourneySummary?.firstVisit?.utmParameters);
  const last = normalizeUtm(order.customerJourneySummary?.lastVisit?.utmParameters);
  return {
    source: last.source || first.source || "",
    medium: last.medium || first.medium || "",
    campaign: last.campaign || first.campaign || "",
    content: last.content || first.content || "",
    term: last.term || first.term || "",
  };
}

function normalizeUtm(utm) {
  return {
    source: String(utm?.source || "").toLowerCase(),
    medium: String(utm?.medium || "").toLowerCase(),
    campaign: String(utm?.campaign || ""),
    content: String(utm?.content || ""),
    term: String(utm?.term || ""),
  };
}

function addMetric(map, key, revenue, count, extra = {}) {
  const existing = map.get(key) || { key, revenue: 0, count: 0, ...extra };
  existing.revenue += revenue;
  existing.count += count;
  map.set(key, existing);
}

function sortedMetrics(map, field = "revenue", direction = "desc") {
  return [...map.values()].sort((a, b) => {
    const result = a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0;
    return direction === "asc" ? result : -result;
  });
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function money(value) {
  return Number(value || 0);
}

function normalizeShop(shop) {
  return String(shop || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function assertEnv() {
  const missing = ["SHOPIFY_SHOP", "SHOPIFY_ADMIN_ACCESS_TOKEN"].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function printHelp() {
  console.log(`
Usage:
  node scripts/openai-dashboard/build-dashboard-data.mjs

Required:
  SHOPIFY_SHOP
  SHOPIFY_ADMIN_ACCESS_TOKEN with read_orders and read_products

Optional:
  OPENAI_DASHBOARD_DAYS=30
  OPENAI_DASHBOARD_UTM_SOURCE=openai
  OPENAI_AD_SPEND=250
  OPENAI_FEED_OUTPUT=exports/openai-products.jsonl.gz
  OPENAI_DASHBOARD_OUTPUT=dashboard/dashboard-data.js
`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
