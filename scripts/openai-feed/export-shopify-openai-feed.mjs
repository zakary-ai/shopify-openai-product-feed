#!/usr/bin/env node
import { createGzip } from "node:zlib";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";
const PAGE_SIZE = Number(process.env.SHOPIFY_PAGE_SIZE || 100);
const OUTPUT_FILE = resolve(process.env.OPENAI_FEED_OUTPUT || "exports/openai-products.jsonl.gz");

const QUERY = `
  query OpenAIProductFeedPage($cursor: String) {
    productVariants(first: ${PAGE_SIZE}, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        sku
        barcode
        price
        compareAtPrice
        inventoryQuantity
        selectedOptions {
          name
          value
        }
        media(first: 1) {
          nodes {
            preview {
              image {
                url
              }
            }
          }
        }
        product {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          onlineStoreUrl
          collections(first: 5) {
            nodes {
              title
              handle
            }
          }
          featuredMedia {
            preview {
              image {
                url
              }
            }
          }
        }
      }
    }
  }
`;

const requiredEnv = [
  "SHOPIFY_SHOP",
  "SHOPIFY_ADMIN_ACCESS_TOKEN",
  "OPENAI_FEED_CURRENCY",
  "OPENAI_FEED_SELLER_NAME",
  "OPENAI_FEED_SELLER_URL",
  "OPENAI_FEED_RETURN_POLICY_URL",
];

function main() {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }

  if (process.argv.includes("--sample")) {
    writeRows([sampleRow()]);
    return;
  }

  assertEnv();
  exportFeed();
}

async function exportFeed() {
  let cursor = null;
  let count = 0;

  async function* rows() {
    do {
      const data = await shopifyGraphql(QUERY, { cursor });
      const connection = data.productVariants;

      for (const variant of connection.nodes) {
        const row = mapVariantToOpenAIProduct(variant);
        if (row) {
          count += 1;
          yield `${JSON.stringify(row)}\n`;
        }
      }

      cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
      process.stderr.write(`Exported ${count} feed rows\r`);
    } while (cursor);
  }

  await writeRows(rows());
  process.stderr.write(`\nDone. Wrote ${count} rows to ${OUTPUT_FILE}\n`);
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
    throw new Error(`Shopify GraphQL failed: ${JSON.stringify(body.errors || body)}`);
  }

  return body.data;
}

async function writeRows(rows) {
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  async function* jsonl() {
    for await (const row of rows) {
      yield typeof row === "string" ? row : `${JSON.stringify(row)}\n`;
    }
  }

  await pipeline(Readable.from(jsonl()), createGzip(), createWriteStream(OUTPUT_FILE));
  console.error(`Wrote ${OUTPUT_FILE}`);
}

function mapVariantToOpenAIProduct(variant) {
  const product = variant.product;
  const itemId = truncate(variant.sku || gidTail(variant.id), 100);
  const price = money(variant.price);
  const compareAtPrice = money(variant.compareAtPrice);
  const hasSale = compareAtPrice && Number(compareAtPrice) > Number(price);
  const imageUrl = variant.media?.nodes?.[0]?.preview?.image?.url || product.featuredMedia?.preview?.image?.url;
  const url = product.onlineStoreUrl || fallbackProductUrl(product.handle, variant.id);
  const shopifyCollectionCategory = collectionCategory(product.collections?.nodes);
  const productCategory = inferAdCategory({
    title: joinTitle(product.title, variant.title),
    descriptionHtml: product.descriptionHtml,
    productType: product.productType,
    collectionCategory: shopifyCollectionCategory,
  });
  const title = optimizedTitle(joinTitle(product.title, variant.title));
  const description = optimizedDescription(product.descriptionHtml, title, productCategory);

  if (!itemId || !price || !imageUrl || !url) {
    console.warn(`Skipping ${variant.id}: missing item_id, price, image_url, or url`);
    return null;
  }

  const options = Object.fromEntries(
    (variant.selectedOptions || [])
      .filter((option) => option.name && option.value && option.value !== "Default Title")
      .map((option) => [option.name, option.value]),
  );

  const row = {
    is_eligible_search: true,
    is_eligible_checkout: false,
    is_eligible_ads: true,
    item_id: itemId,
    title,
    description,
    url,
    brand: truncate(product.vendor || process.env.OPENAI_FEED_SELLER_NAME, 70),
    condition: "new",
    image_url: imageUrl,
    price: `${hasSale ? compareAtPrice : price} ${process.env.OPENAI_FEED_CURRENCY}`,
    availability: Number(variant.inventoryQuantity || 0) > 0 ? "in_stock" : "out_of_stock",
    group_id: gidTail(product.id),
    listing_has_variations: Object.keys(options).length > 0,
    item_group_title: truncate(product.title, 150),
    seller_name: truncate(process.env.OPENAI_FEED_SELLER_NAME, 70),
    seller_url: process.env.OPENAI_FEED_SELLER_URL,
    return_policy: process.env.OPENAI_FEED_RETURN_POLICY_URL,
    target_countries: [process.env.OPENAI_FEED_TARGET_COUNTRY || "US"],
    store_country: process.env.OPENAI_FEED_STORE_COUNTRY || "US",
    ads_metadata: {
      ad_category: productCategory,
      product_line: productCategory.split(" > ").slice(0, 2).join(" > "),
      shopify_collections: shopifyCollectionCategory || product.productType || "Uncategorized",
    },
  };

  if (hasSale) row.sale_price = `${price} ${process.env.OPENAI_FEED_CURRENCY}`;
  if (validGtin(variant.barcode)) row.gtin = variant.barcode;
  if (productCategory) row.product_category = truncate(productCategory, 250);
  if (Object.keys(options).length > 0) row.variant_dict = options;
  if (options.Color || options.Colour) row.color = truncate(options.Color || options.Colour, 40);
  if (options.Size) row.size = truncate(options.Size, 20);

  return row;
}

function assertEnv() {
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function normalizeShop(shop) {
  return shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function fallbackProductUrl(handle, variantId) {
  const base = process.env.OPENAI_FEED_PUBLIC_STORE_URL;
  if (!base || !handle) return null;
  const url = new URL(`/products/${handle}`, base);
  url.searchParams.set("variant", gidTail(variantId));
  return url.toString();
}

function money(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number(value).toFixed(2);
}

function gidTail(gid) {
  return String(gid || "").split("/").pop();
}

function joinTitle(productTitle, variantTitle) {
  if (!variantTitle || variantTitle === "Default Title") return productTitle;
  return `${productTitle} - ${variantTitle}`;
}

function optimizedTitle(title) {
  const cleaned = cleanWhitespace(title);
  const leadingMeta = cleaned.match(/^\(([^)]*)\)\s*(.+)$/);
  if (!leadingMeta) return truncate(cleaned, 150);

  const [, meta, productName] = leadingMeta;
  const isShortPrefix = meta.length <= 60;
  if (!isShortPrefix) return truncate(cleaned, 150);

  return truncate(`${productName} - ${meta}`, 150);
}

function optimizedDescription(html, title, productCategory) {
  const text = stripHtml(html);
  const withoutLabel = text.replace(/^(description|product description|details|features)\s*[:.-]?\s*/i, "");
  const firstSentence = withoutLabel.match(/^(.{60,220}?[.!?])\s/)?.[1] || withoutLabel;
  const cleaned = cleanWhitespace(firstSentence || title);
  const category = productCategory ? ` Category: ${productCategory}.` : "";

  return truncate(`${cleaned}${category}`, 5000);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, max) {
  const text = String(value || "").trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

function validGtin(value) {
  return /^\d{8,14}$/.test(String(value || ""));
}

function collectionCategory(collections) {
  const titles = (collections || [])
    .map((collection) => stripHtml(collection.title))
    .filter(Boolean)
    .filter((title) => !/^(all|products|new arrivals|cross-sell application)$/i.test(title))
    .slice(0, 3);

  return titles.join(" > ");
}

function inferAdCategory({ title, descriptionHtml, productType, collectionCategory }) {
  const source = cleanWhitespace(`${title} ${stripHtml(descriptionHtml)} ${productType || ""} ${collectionCategory || ""}`).toLowerCase();

  const rules = [
    [/nitrile.*glove|glove.*nitrile/, "Safety & PPE > Disposable Gloves > Nitrile Gloves"],
    [/latex.*glove|glove.*latex/, "Safety & PPE > Disposable Gloves > Latex Gloves"],
    [/vinyl.*glove|glove.*vinyl/, "Safety & PPE > Disposable Gloves > Vinyl Gloves"],
    [/disposable.*glove|glove.*disposable|exam.*glove|medical.*glove/, "Safety & PPE > Disposable Gloves"],
    [/cut.?resistant.*glove|glove.*cut.?resistant/, "Safety & PPE > Work Gloves > Cut Resistant Gloves"],
    [/palm.?coated.*glove|coated.*glove/, "Safety & PPE > Work Gloves > Palm Coated Gloves"],
    [/chemical.*glove|glove.*chemical/, "Safety & PPE > Work Gloves > Chemical Resistant Gloves"],
    [/impact.*glove|anti.?vibration.*glove/, "Safety & PPE > Work Gloves > Impact Gloves"],
    [/cold.*weather.*glove|winter.*glove|thermal.*glove/, "Safety & PPE > Work Gloves > Cold Weather Gloves"],
    [/leather.*glove|glove.*leather/, "Safety & PPE > Work Gloves > Leather Gloves"],
    [/work.*glove|glove.*work|knit.*glove|pallet.*glove/, "Safety & PPE > Work Gloves"],
    [/lab coat|labcoat|disposable.*jacket/, "Safety & PPE > Disposable Clothing > Lab Coats & Jackets"],
    [/coverall|protective suit|disposable.*clothing/, "Safety & PPE > Disposable Clothing > Coveralls"],
    [/bouffant|beard.*net|hair.*net/, "Safety & PPE > Disposable Clothing > Hair & Beard Covers"],
    [/mask|respirator/, "Safety & PPE > Respiratory Protection > Masks & Respirators"],
    [/hi.?vis|high visibility|reflective/, "Safety & PPE > Hi-Visibility Apparel"],
    [/flame resistant|fire resistant|fr clothing|\bfr\b/, "Safety & PPE > Flame Resistant Clothing"],
    [/rain.*boot|rubber.*boot|overshoe|shoe cover/, "Safety & PPE > Footwear > Rain Boots & Shoe Covers"],
    [/safety.*boot|work.*boot|safety.*shoe/, "Safety & PPE > Footwear > Safety Boots & Shoes"],
    [/hard hat|helmet/, "Safety & PPE > Head Protection > Hard Hats"],
    [/fall protection|harness|lanyard/, "Safety & PPE > Fall Protection"],
    [/traffic|flag|windsock|cone|barricade/, "Safety & PPE > Traffic Safety"],
    [/rain coat|rain jacket|rain gear|poncho|rainsuit/, "Workwear > Rain Gear"],
    [/winter jacket|cold weather|parka|insulated jacket/, "Workwear > Cold Weather Apparel"],
    [/smock|vest/, "Workwear > Smocks & Vests"],
    [/apron/, "Workwear > Aprons"],
    [/umbrella/, "Outdoor & Rain Supplies > Umbrellas"],
    [/tarp|tarpaulin/, "Industrial Supplies > Tarps"],
    [/towel|rag|wipe|cleaning/, "Industrial Supplies > Cleaning Supplies"],
  ];

  for (const [pattern, category] of rules) {
    if (pattern.test(source)) return category;
  }

  return collectionCategory || productType || "Industrial & Safety Supplies";
}

function sampleRow() {
  return mapVariantToOpenAIProduct({
    id: "gid://shopify/ProductVariant/1234567890",
    title: "Black / M",
    sku: "EXAMPLE-GLOVE-BLK-M",
    barcode: "123456789012",
    price: "59.99",
    compareAtPrice: "79.99",
    inventoryQuantity: 12,
    selectedOptions: [
      { name: "Color", value: "Black" },
      { name: "Size", value: "M" },
    ],
    media: {
      nodes: [
        {
          preview: {
            image: { url: "https://www.example.com/cdn/shop/files/sample.jpg" },
          },
        },
      ],
    },
    product: {
      id: "gid://shopify/Product/987654321",
      title: "Example Work Glove",
      handle: "example-work-glove",
      descriptionHtml: "<p>Comfortable touchscreen work gloves.</p>",
      vendor: "Example Store",
      productType: "Apparel & Accessories > Clothing Accessories > Gloves",
      collections: {
        nodes: [
          { title: "Winter Gloves", handle: "winter-gloves" },
          { title: "Touchscreen Gloves", handle: "touchscreen-gloves" },
        ],
      },
      onlineStoreUrl: "https://www.example.com/products/example-work-glove",
      featuredMedia: null,
    },
  });
}

function printHelp() {
  console.log(`
Usage:
  node scripts/openai-feed/export-shopify-openai-feed.mjs
  node scripts/openai-feed/export-shopify-openai-feed.mjs --sample

Required environment variables:
  SHOPIFY_SHOP                  your-store.myshopify.com
  SHOPIFY_ADMIN_ACCESS_TOKEN    Admin API access token from get-shopify-oauth-token.mjs
  OPENAI_FEED_CURRENCY          USD
  OPENAI_FEED_SELLER_NAME       Your Store Name
  OPENAI_FEED_SELLER_URL        https://www.example.com
  OPENAI_FEED_RETURN_POLICY_URL https://www.example.com/policies/refund-policy

Optional:
  OPENAI_FEED_PUBLIC_STORE_URL  Used if Shopify onlineStoreUrl is unavailable
  OPENAI_FEED_TARGET_COUNTRY    Defaults to US
  OPENAI_FEED_STORE_COUNTRY     Defaults to US
  OPENAI_FEED_OUTPUT            Defaults to exports/openai-products.jsonl.gz
  SHOPIFY_API_VERSION           Defaults to 2026-01
`);
}

main();
