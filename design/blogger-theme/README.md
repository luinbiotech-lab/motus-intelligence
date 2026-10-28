# MOTUS theme package — PR #31

This is an offline, reversible customization of the owner's exported theme, not a replacement of Blogger's widgets. No deployment has occurred.

## Build the installable XML from the real backup

1. In the MOTUS Blogger **Theme** menu, export a backup XML. Capture current theme, mobile and layout settings. Keep the backup outside the public repository.
2. Run `python3 scripts/build-blogger-theme.py --input /safe/path/motus-before.xml --output /safe/path/motus-candidate-v1.xml`.
3. The candidate retains every original byte, including widgets, comments, canonical metadata, analytics and Blogger bindings. Only three marked blocks are inserted. The accompanying verification JSON records hashes and widget IDs. Rebuilding does not duplicate the overlay; existing output files are never overwritten.
   Immediately before import, run `python3 scripts/build-blogger-theme.py --input /safe/path/motus-before.xml --output /safe/path/motus-candidate-v1.xml --verify-manifest /safe/path/motus-candidate-v1.verification.json`. This read-only check rejects a changed backup/candidate, changed widget manifest, incomplete overlay and outdated design assets. Verification never uploads the theme or writes to either file.
4. Compare candidate with the backup. Use Blogger's preview/import validation before saving; an XML parser pass alone is not Blogger acceptance. Confirm the displayed blog is **motusnova.blogspot.com**, not another account's blog.
5. Review 1440 / 768 / 390 / 320px layouts on home, existing article, label, search, archive, comments and pagination. Verify native article charts retain their direction colors and all content remains reachable. A category link is only an archive link; it does not enable AI generation or scheduling.
6. After Claude review on this same PR and the remaining checks, apply within the user's approved theme-only scope. Read back the public home and article page, preserve screenshots and the applied XML hash. Roll back by restoring the original exported XML if content/navigation fails.

## What is implemented

- Brand masthead, responsive category navigation, native Blogger search, homepage editorial introduction and category archive cards, latest-journal divider, sources/disclaimer footer.
- Original Blog widget continues to own actual stories, timestamps, labels, search results, comments and pagination. No fabricated featured stories or live metrics, external font dependency, analytics replacement, feed script, OAuth change or publishing operation.
- CSS supports the Contempo content surfaces. Whether the actual current theme is Contempo still requires its export. The preview is an approximation and cannot prove live compatibility.

## Evidence and open gates

- `python3 -m unittest discover -s tests -p 'test_blogger_theme.py' -v` tests synthetic XML, lossless rollback, widget identity, duplicate IDs, malformed XML and repeat builds. The Node suite invokes these tests in CI.
- A real production export is **not available** as of the 2026-10-27 session: the connected Blogger page shows a reading list without managed blogs; its Google account menu reports an error. No settings, posts, credentials or schedules were changed.
- Actual XML export, Blogger import, all four rendered viewport checks, Claude independent review, application and public readback remain **NOT VERIFIED**.

## Continuation evidence — 2026-10-28

- Public MOTUS homepage has body class `version-1-3-3 variant-indie_light` and the expected `.centered`, `.centered-top-container`, `.centered-bottom`, `.bg-photo-container`, `.blog-posts` and `.post-outer-container` surfaces. `Blog1` and `FeaturedPost1` are present. The public page has no `motus-theme-overlay` element; the new theme has not been applied. This DOM observation supports selector compatibility but does not replace an XML export/import or responsive rendering check.
- The public `service.post` link identifies blog ID `3015267553244608361`. A direct theme-management navigation for that ID redirects the current account to the reading list. The account chooser lists only the current `lucius1090@gmail.com` session. Another authorized owner/admin session is needed; blog identity is no longer an unknown.
- Safety coverage now includes 11 Python tests: file/backup tampering, real CLI output/overwrite/read-only verification, scoped includable IDs, exact root validation and broken overlay markers, in addition to the original preservation/rollback checks.

Official reference: https://support.google.com/blogger/answer/46888 (sections/widgets are replaced with matching div IDs); https://support.google.com/blogger/answer/176245 (theme HTML customization).

## Authenticated production-export validation — 2026-10-28

The owner specified `luinbiotech@gmail.com`. The Blogger account selector successfully switched to that account, and the actual MOTUS dashboard and Theme manager opened for blog `3015267553244608361` / `motusnova.blogspot.com`. Current theme is Contempo Light. A real 134,389-byte XML backup was exported and retained outside the repository (SHA256 `c5077a39af626a08d3c767d74afe4f1fd172b21e99f97cca24f4117aa493f402`). All 13 widget definitions/settings are preserved.

The real export exposed two defects that synthetic tests had missed: alternative comment includables legitimately reuse HTML IDs, and Blogger emits ordinary style CDATA delimiters literally into HTML. The builder now scopes HTML ID checks to each includable while keeping widget/section IDs global, and CSS-comment-wraps the CDATA boundaries. The native theme editor server preview rendered the MOTUS masthead, navigation, search, categories and existing posts without saving. Desktop/phone/tablet preview content widths measured 1348/397/753px with scrollWidth equal to clientWidth. These are native preview sizes, not the exact required 1440/768/390/320 checks. Visual inspection also found that the original nested photo background needed its own selector reset; included in the final candidate.

Fourteen Python safety tests pass, and candidate generation/read-only hash verification succeeds on the real export. This is production-export compatibility and unsaved Blogger preview evidence, not live application. Claude independent review is still absent on PR #31; exact viewport, existing-article/search/archive/comment interaction QA, production save and public readback remain pending. No main merge, post/publication/history, credentials, schedules or automation settings changed. Backups/candidates containing owner settings must not be committed to this repository.
