#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const file = process.argv[2] || "exports/openai-products.jsonl.gz";
const limit = Number(process.argv[3] || 20);
const text = gunzipSync(readFileSync(file)).toString("utf8").trim();
const rows = text.split(/\n/).map((line) => JSON.parse(line));

for (const row of rows.slice(0, limit)) {
  console.log("----");
  console.log(`ID: ${row.item_id}`);
  console.log(`Title: ${row.title}`);
  console.log(`Description: ${row.description.slice(0, 220)}`);
  console.log(`Category: ${row.product_category || ""}`);
}

const leadingParentheses = rows.filter((row) => /^\(/.test(row.title));
console.log("----");
console.log(`Rows: ${rows.length}`);
console.log(`Titles still starting with (: ${leadingParentheses.length}`);
if (leadingParentheses.length > 0) {
  console.log("Examples:");
  for (const row of leadingParentheses.slice(0, 10)) {
    console.log(`${row.item_id}: ${row.title}`);
  }
}
