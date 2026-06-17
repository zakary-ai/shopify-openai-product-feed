# OpenAI Ads Tracking Dashboard

This dashboard reads Shopify orders that have `utm_source=openai` in the customer journey attribution.

For macOS Terminal commands, use `README-dash-Mac.md`.

## Refresh data

Use the same PowerShell session/environment you used for the feed exporter. The token must have `read_orders`.

```powershell
$env:OPENAI_DASHBOARD_DAYS = "30"
node scripts/openai-dashboard/build-dashboard-data.mjs
```

Then open:

```text
dashboard\index.html
```

## Optional spend

If you want ROAS before OpenAI Ads API reporting is wired in, enter spend manually:

```powershell
$env:OPENAI_AD_SPEND = "250"
node scripts/openai-dashboard/build-dashboard-data.mjs
```

## If Shopify rejects the query

Reauthorize the Shopify dev app with order scope:

```powershell
$env:SHOPIFY_SCOPES = "read_products,read_orders"
node scripts/openai-feed/get-shopify-oauth-token.mjs
```

Paste the new `$env:SHOPIFY_ADMIN_ACCESS_TOKEN = "..."` line, then rerun the dashboard builder.
