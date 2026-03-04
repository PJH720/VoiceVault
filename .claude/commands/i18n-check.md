Scan all .tsx files in src/renderer/ for hardcoded user-facing strings.
1. Find any string literals in JSX that aren't wrapped in t()
2. Check all locale files (ko.json, en.json, ja.json) have matching keys
3. Flag missing translations in any locale
4. Verify interpolation variables ({{count}}, {{number}}) exist in all locales
5. Report: total keys, complete locales, missing translations per locale
