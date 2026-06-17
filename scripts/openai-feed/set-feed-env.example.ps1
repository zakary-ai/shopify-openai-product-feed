# Copy this file to set-feed-env.local.ps1, fill in the values, then run:
# . .\scripts\openai-feed\set-feed-env.local.ps1
#
# The leading ". " matters: it loads the variables into your current
# PowerShell session so the Node exporter can read them.

$env:SHOPIFY_SHOP = "your-store.myshopify.com"
$env:SHOPIFY_ADMIN_ACCESS_TOKEN = "paste_the_token_printed_by_get-shopify-oauth-token_here"
$env:SHOPIFY_SCOPES = "read_products,read_orders"

$env:OPENAI_FEED_CURRENCY = "USD"
$env:OPENAI_FEED_SELLER_NAME = "Your Store Name"
$env:OPENAI_FEED_SELLER_URL = "https://www.example.com"
$env:OPENAI_FEED_RETURN_POLICY_URL = "https://www.example.com/policies/refund-policy"
$env:OPENAI_FEED_PUBLIC_STORE_URL = "https://www.example.com"
