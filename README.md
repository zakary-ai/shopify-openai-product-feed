# Shopify to OpenAI Ads Product Feed

This repo exports Shopify products into an OpenAI Ads product feed file and includes a small local tracking dashboard.

Mac users can follow `README-Mac.md`.

## What this includes

- `scripts/openai-feed/get-shopify-oauth-token.mjs` - gets a Shopify Admin access token from your Shopify dev app.
- `scripts/openai-feed/export-shopify-openai-feed.mjs` - exports Shopify variants to `exports/openai-products.jsonl.gz`.
- `scripts/openai-feed/preview-feed-copy.mjs` - previews feed titles/descriptions before upload.
- `scripts/openai-feed/upload-openai-feed.winscp.txt` - WinSCP upload template.
- `scripts/openai-dashboard/build-dashboard-data.mjs` - builds local Shopify attribution dashboard data.
- `dashboard/index.html` - opens the local dashboard.

## Quick start

```powershell
cd path\to\this\repo

$env:SHOPIFY_SHOP = "your-store.myshopify.com"
$env:SHOPIFY_CLIENT_ID = "your_shopify_app_client_id"
$env:SHOPIFY_CLIENT_SECRET = "your_shopify_app_client_secret"
$env:SHOPIFY_SCOPES = "read_products,read_orders"

node scripts/openai-feed/get-shopify-oauth-token.mjs
```

Open the printed Shopify authorization URL. After approval, paste the printed:

```powershell
$env:SHOPIFY_ADMIN_ACCESS_TOKEN = "..."
```

Then configure feed values:

```powershell
$env:OPENAI_FEED_CURRENCY = "USD"
$env:OPENAI_FEED_SELLER_NAME = "Your Store Name"
$env:OPENAI_FEED_SELLER_URL = "https://www.example.com"
$env:OPENAI_FEED_RETURN_POLICY_URL = "https://www.example.com/policies/refund-policy"
$env:OPENAI_FEED_PUBLIC_STORE_URL = "https://www.example.com"
```

Export and preview:

```powershell
node scripts/openai-feed/export-shopify-openai-feed.mjs
node scripts/openai-feed/preview-feed-copy.mjs exports/openai-products.jsonl.gz 30
```

Upload `exports/openai-products.jsonl.gz` to OpenAI Ads Manager's SFTP feed connection.

## Dashboard

After orders start coming in with `utm_source=openai`:

```powershell
node scripts/openai-dashboard/build-dashboard-data.mjs
```

Open:

```text
dashboard\index.html
```

Mac users can follow `scripts/openai-dashboard/README-dash-Mac.md`.

## Tracking parameters

Use this in OpenAI Ads Manager:

```text
utm_source=openai&utm_medium=paid_ads&utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={ad_group_id}
```

## Security

Do not commit real Shopify client secrets, Admin access tokens, SFTP passwords, generated feeds, or local dashboard data.
