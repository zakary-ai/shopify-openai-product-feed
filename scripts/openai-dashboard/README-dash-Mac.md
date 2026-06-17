# OpenAI Ads Tracking Dashboard for Mac

This dashboard reads Shopify orders that have `utm_source=openai` in the customer journey attribution.

Use these commands in macOS Terminal. The examples assume the default `zsh` shell.

## Prerequisites

- Node.js 18 or newer
- A Shopify dev app with these Admin API scopes:
  - `read_products`
  - `read_orders`
- Your Shopify shop domain, such as `your-store.myshopify.com`
- Your Shopify app client ID and client secret

## Open the project

From Terminal, go to the repo folder:

```sh
cd /path/to/shopify-openai-product-feed-main
```

If the folder is on your Desktop, the command may look like this:

```sh
cd "$HOME/Desktop/shopify-openai-product-feed-main"
```

## Configure Shopify access

Set the Shopify app values:

```sh
export SHOPIFY_SHOP="your-store.myshopify.com"
export SHOPIFY_CLIENT_ID="your_shopify_app_client_id"
export SHOPIFY_CLIENT_SECRET="your_shopify_app_client_secret"
export SHOPIFY_SCOPES="read_products,read_orders"
```

Get a Shopify Admin access token:

```sh
node scripts/openai-feed/get-shopify-oauth-token.mjs
```

Open the printed Shopify authorization URL in your browser. After approval, the script prints a token command. On Mac, use this format:

```sh
export SHOPIFY_ADMIN_ACCESS_TOKEN="..."
```

Paste that command into the same Terminal session.

## Refresh dashboard data

Set how many days of order attribution to read:

```sh
export OPENAI_DASHBOARD_DAYS="30"
```

Build the dashboard data:

```sh
node scripts/openai-dashboard/build-dashboard-data.mjs
```

Open the dashboard:

```sh
open dashboard/index.html
```

## Optional spend

If you want ROAS before OpenAI Ads API reporting is wired in, enter spend manually:

```sh
export OPENAI_AD_SPEND="250"
node scripts/openai-dashboard/build-dashboard-data.mjs
open dashboard/index.html
```

## If Shopify rejects the query

Reauthorize the Shopify dev app with order scope:

```sh
export SHOPIFY_SCOPES="read_products,read_orders"
node scripts/openai-feed/get-shopify-oauth-token.mjs
```

Open the new authorization URL, approve it, then paste the new token as:

```sh
export SHOPIFY_ADMIN_ACCESS_TOKEN="..."
```

Rerun the dashboard builder:

```sh
node scripts/openai-dashboard/build-dashboard-data.mjs
open dashboard/index.html
```

## Useful Mac notes

- Environment variables set with `export` only apply to the current Terminal window.
- Keep using the same Terminal session after setting tokens and dashboard values.
- Do not commit real Shopify client secrets, Admin access tokens, generated feeds, or local dashboard data.
