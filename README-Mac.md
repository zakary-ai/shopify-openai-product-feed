# Shopify to OpenAI Ads Product Feed for Mac

This repo exports Shopify products into an OpenAI Ads product feed file and includes a small local tracking dashboard.

## What this includes

- `scripts/openai-feed/get-shopify-oauth-token.mjs` - gets a Shopify Admin access token from your Shopify dev app.
- `scripts/openai-feed/export-shopify-openai-feed.mjs` - exports Shopify variants to `exports/openai-products.jsonl.gz`.
- `scripts/openai-feed/preview-feed-copy.mjs` - previews feed titles/descriptions before upload.
- `scripts/openai-feed/upload-openai-feed.winscp.txt` - WinSCP upload template for Windows users.
- `scripts/openai-dashboard/build-dashboard-data.mjs` - builds local Shopify attribution dashboard data.
- `dashboard/index.html` - opens the local dashboard.

## Quick start

Open macOS Terminal and go to this repo:

```sh
cd /path/to/this/repo
```

If the repo is on your Desktop, the command may look like this:

```sh
cd "$HOME/Desktop/shopify-openai-product-feed-main"
```

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

Open the printed Shopify authorization URL in your browser. After approval, paste the printed token into the same Terminal window using Mac syntax:

```sh
export SHOPIFY_ADMIN_ACCESS_TOKEN="..."
```

Then configure feed values:

```sh
export OPENAI_FEED_CURRENCY="USD"
export OPENAI_FEED_SELLER_NAME="Your Store Name"
export OPENAI_FEED_SELLER_URL="https://www.example.com"
export OPENAI_FEED_RETURN_POLICY_URL="https://www.example.com/policies/refund-policy"
export OPENAI_FEED_PUBLIC_STORE_URL="https://www.example.com"
```

Export and preview:

```sh
node scripts/openai-feed/export-shopify-openai-feed.mjs
node scripts/openai-feed/preview-feed-copy.mjs exports/openai-products.jsonl.gz 30
```

Upload `exports/openai-products.jsonl.gz` to OpenAI Ads Manager's SFTP feed connection.

On Mac, use your preferred SFTP client, such as Cyberduck, Transmit, FileZilla, or the built-in `sftp` command. The included `scripts/openai-feed/upload-openai-feed.winscp.txt` file is for WinSCP on Windows.

## Dashboard

After orders start coming in with `utm_source=openai`:

```sh
node scripts/openai-dashboard/build-dashboard-data.mjs
```

Open:

```sh
open dashboard/index.html
```

Mac users can follow `scripts/openai-dashboard/README-dash-Mac.md` for the dashboard-specific workflow.

## Tracking parameters

Use this in OpenAI Ads Manager:

```text
utm_source=openai&utm_medium=paid_ads&utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={ad_group_id}
```

## Security

Do not commit real Shopify client secrets, Admin access tokens, SFTP passwords, generated feeds, or local dashboard data.
