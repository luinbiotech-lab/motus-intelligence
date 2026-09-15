# MOTUS Publisher Target Migration

- Starting HEAD: `10be032bc850af324d39128392e34a5428ae3322`
- Brand: `MOTUS`
- Display name: `MOTUS | What Moves the World`
- Blogger: `https://motusnova.blogspot.com/`
- Golden Day: `2026-09-11`
- Report ID: `MANUAL-2026-09-11-7cb0ccf11f29`

## Boundary

The market Engine collection, validation, cross-verification, analysis, claims, evidence, approval, and publication state machine remain unchanged. `src/publishers/motus.ts` does not import Engine domain models or pipeline services. Engine output is mapped once into `src/content/publisher-schema.ts` and passed to the MOTUS Publisher.

## Content model

The shared metadata supports company, sector, theme, country, and region arrays without limiting values to the United States. MOTUS supports these categories:

- `Daily Market`
- `AI & Industry`
- `Global Company`
- `Market / Investment Insight`
- `Evergreen`

The Golden Day Daily output uses `Daily Market` as its primary category and adds applicable industry, company, and insight categories. Its publisher title and slug use `MOTUS Daily Market` and `daily-market-2026-09-11`; the underlying verified market narrative and numbers are unchanged.

## URL and CTA policy

The public phrase is “전체 분석은 MOTUS에서 확인하세요”. A4 and Naver packages accept only a real URL returned for a remote Blogger draft or published post. Before that URL exists, their URL fields remain empty and the QR target is unresolved. No preview, placeholder, or fake success URL is presented as the detailed analysis URL.

## Current publication state

The target change generated a new MOTUS preview and reset the external publication step to `PREVIEW_READY`. No Blogger credential is configured, no API publish was attempted, and no real post URL exists yet.
