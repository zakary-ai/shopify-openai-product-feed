#!/usr/bin/env node
import { createServer } from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SHOPIFY_SHOP = normalizeShop(process.env.SHOPIFY_SHOP);
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || process.env.CLIENT_SECRET;
const SCOPES = process.env.SHOPIFY_SCOPES || "read_products,read_orders";
const REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI || "http://localhost:3456/callback";
const STATE = randomBytes(16).toString("hex");

if (process.argv.includes("--help")) {
  printHelp();
  process.exit(0);
}

assertEnv();

const redirect = new URL(REDIRECT_URI);
const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, REDIRECT_URI);

    if (requestUrl.pathname !== redirect.pathname) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const params = Object.fromEntries(requestUrl.searchParams);
    verifyCallback(params);

    const token = await exchangeCodeForToken(params.code);
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("Shopify authorization complete. You can close this tab and return to PowerShell.");

    console.log("\nShopify authorization complete.");
    console.log("Run this in the same PowerShell window before exporting:");
    console.log(`$env:SHOPIFY_ADMIN_ACCESS_TOKEN = "${token.access_token}"`);
    console.log(`\nGranted scopes: ${token.scope || "(not returned)"}`);
    server.close();
  } catch (error) {
    response.writeHead(400, { "Content-Type": "text/plain" });
    response.end(`Authorization failed: ${error.message}`);
    console.error(`Authorization failed: ${error.message}`);
  }
});

server.listen(Number(redirect.port || 80), redirect.hostname, () => {
  console.log("Open this URL in your browser to install/authorize the Shopify app:\n");
  console.log(authorizationUrl());
  console.log("\nWaiting for Shopify callback...");
});

function authorizationUrl() {
  const url = new URL(`https://${SHOPIFY_SHOP}/admin/oauth/authorize`);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", STATE);
  return url.toString();
}

async function exchangeCodeForToken(code) {
  const response = await fetch(`https://${SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    }),
  });

  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(JSON.stringify(body));
  }

  return body;
}

function verifyCallback(params) {
  if (!params.code) throw new Error("Missing authorization code.");
  if (params.state !== STATE) throw new Error("State did not match.");
  if (!validHmac(params)) throw new Error("Shopify callback HMAC was invalid.");
}

function validHmac(params) {
  const { hmac, signature, ...rest } = params;
  if (!hmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(",") : rest[key]}`)
    .join("&");

  const digest = createHmac("sha256", CLIENT_SECRET).update(message).digest("hex");
  return safeEqual(digest, hmac);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function assertEnv() {
  const missing = [];
  if (!SHOPIFY_SHOP) missing.push("SHOPIFY_SHOP");
  if (!CLIENT_ID) missing.push("SHOPIFY_CLIENT_ID or CLIENT_ID");
  if (!CLIENT_SECRET) missing.push("SHOPIFY_CLIENT_SECRET or CLIENT_SECRET");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function normalizeShop(shop) {
  return String(shop || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function printHelp() {
  console.log(`
Usage:
  node scripts/openai-feed/get-shopify-oauth-token.mjs

Required environment variables:
  SHOPIFY_SHOP                  your-store.myshopify.com
  SHOPIFY_CLIENT_ID             App client ID from Shopify Dev Dashboard
  SHOPIFY_CLIENT_SECRET         App client secret from Shopify Dev Dashboard

Optional:
  SHOPIFY_SCOPES                Defaults to read_products,read_orders
  SHOPIFY_REDIRECT_URI          Defaults to http://localhost:3456/callback

Add SHOPIFY_REDIRECT_URI to your app's allowed redirect URLs before running.
`);
}
