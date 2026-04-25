# Contributing Translations

## Add a new locale

1. Copy `src/renderer/src/i18n/locales/en.json` to `<locale>.json`
2. Translate only values (keep keys intact)
3. Register locale metadata in `src/renderer/src/hooks/useLocale.ts`
4. Register resource in `src/renderer/src/i18n/index.ts`
5. Run `pnpm check:translations`

## Rules

- Keep interpolation placeholders unchanged (`{{count}}`, `{{value}}`, etc.)
- Use natural UI wording for the locale
- Keep JSON structure exactly aligned with `en.json`
- If a locale is incomplete, do not merge until missing keys are resolved
