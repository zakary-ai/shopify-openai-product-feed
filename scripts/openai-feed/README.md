# OpenAI Ads Product Feed Export

This exports Shopify variants to OpenAI's product feed file-upload schema as a stable `jsonl.gz` snapshot for SFTP upload.

## 1. Add Shopify redirect URL

In your Shopify Dev Dashboard app settings, add:

```text
http://localhost:3456/callback
```

## 2. Configure Shopify app credentials

Paste your own values into PowerShell:

```powershell
$env:SHOPIFY_SHOP = "your-store.myshopify.com"
$env:SHOPIFY_CLIENT_ID = "your_shopify_app_client_id"
$env:SHOPIFY_CLIENT_SECRET = "your_shopify_app_client_secret"
$env:SHOPIFY_SCOPES = "read_products,read_orders"
```

## 3. Get a Shopify Admin access token

```powershell
node scripts/openai-feed/get-shopify-oauth-token.mjs
```

Open the printed URL, approve the app, then paste the `$env:SHOPIFY_ADMIN_ACCESS_TOKEN = "..."`
line it prints into the same PowerShell window.

## 4. Configure feed settings

Paste your own store values:

```powershell
$env:OPENAI_FEED_CURRENCY = "USD"
$env:OPENAI_FEED_SELLER_NAME = "Your Store Name"
$env:OPENAI_FEED_SELLER_URL = "https://www.example.com"
$env:OPENAI_FEED_RETURN_POLICY_URL = "https://www.example.com/policies/refund-policy"
$env:OPENAI_FEED_PUBLIC_STORE_URL = "https://www.example.com"
```

## 5. Export

```powershell
node scripts/openai-feed/export-shopify-openai-feed.mjs
```

The output file is:

```text
exports/openai-products.jsonl.gz
```

## 6. Preview

```powershell
node scripts/openai-feed/preview-feed-copy.mjs exports/openai-products.jsonl.gz 30
```

You want:

```text
Titles still starting with (: 0
```

## 7. Upload with WinSCP

In Ads Manager, copy the full SFTP username from the feed connection modal. In `scripts/openai-feed/upload-openai-feed.winscp.txt`, replace `OPENAI_SFTP_USERNAME` with that username.

Then run:

```powershell
winscp.com /script=scripts/openai-feed/upload-openai-feed.winscp.txt
```

If you save the OpenAI SFTP connection in WinSCP, you can replace the `open ...` line with your saved site name and avoid putting secrets in the script.

## Notes

- The feed is one row per Shopify variant.
- `is_eligible_ads` is set to `true`.
- `is_eligible_checkout` is set to `false`, so checkout-only policy fields are not required.
- Products without a price, image, or product URL are skipped.
- OpenAI's ads product-feed beta requires at least 1,000 products and at most 2 million products.
