# MOTUS Intelligence Blogger Theme — Design Contract v0.1

Status: preview-only; NOT deployed. Owner approved theme design and verification, not production theme application or main merge.

### Authorization update — 2026-10-27 handoff
The owner has subsequently explicitly requested completion and actual application of the MOTUS theme. Theme-only application is authorized; the earlier preview-only permission statement above is retained as historical context and is superseded for this scope. Main merge, publication, OAuth/credential changes, paid services and schedule changes are not included. Backup, preservation, validation and same-PR Claude cross-review gates still apply. Application remains NOT performed until evidenced by the real Blogger state.

## Brand
- Name: MOTUS INTELLIGENCE; strapline: What Moves the World.
- Editorial proposition: 세상의 변화를 읽고, 그 흐름을 해석하다.
- Narrative chain: AI → technology → industry → company → markets → capital.
- Palette: navy #081D38, ink #10243E, slate #53677F, accent #285D91, background #F4F7FB, white #FFFFFF.
- Responsive design; readable Korean typography; keyboard-accessible category links; no third-party fonts or scripts required.

## Homepage layout
1. Masthead and tagline.
2. Navigation: 미국증시, 국내증시, AI 인텔리전스, 리포트.
3. Featured story with clear editorial summary and publication date.
4. Latest verified stories by category, newest first.
5. Research/report archive and source/methodology/disclaimer footer.
6. No placeholder metrics or fictitious live articles; preview-only sample headlines must be labeled.

## Blogger integration gates
- Export existing Blogger theme XML and capture theme settings BEFORE any change.
- Prefer Blogger Contempo-compatible theme customization; do not assume plain HTML preview is installable Blogger XML.
- Confirm Blogger XML widgets, sections, data bindings, mobile article layout, pagination, labels, search, accessibility and canonical metadata.
- Validate existing published article HTML including inline styles and wide tables/charts; prevent horizontal overflow.
- Test desktop 1440px, tablet 768px, mobile 390px/320px; verify contrast, font scaling and navigation.
- Keep all publishing automation, OAuth, post content, labels, IDs, comments, analytics, search metadata and historical data unchanged.
- Require owner approval before applying to live blog or merging to main.

## Cross-review / acceptance
Claude and GPT review this design contract on the same PR. Do not create a duplicate PR. Preview is not evidence of Blogger live rendering. Release requires a real Blogger XML export, a testable customized XML theme, independent validation and owner sign-off.
