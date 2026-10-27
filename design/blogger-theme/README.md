# MOTUS theme package — PR #31

This is an offline, reversible customization of the owner's exported theme, not a replacement of Blogger's widgets. No deployment has occurred.

## Build the installable XML from the real backup

1. In the MOTUS Blogger **Theme** menu, export a backup XML. Capture current theme, mobile and layout settings. Keep the backup outside the public repository.
2. Run `python3 scripts/build-blogger-theme.py --input /safe/path/motus-before.xml --output /safe/path/motus-candidate-v1.xml`.
3. The candidate retains every original byte, including widgets, comments, canonical metadata, analytics and Blogger bindings. Only three marked blocks are inserted. The accompanying verification JSON records hashes and widget IDs. Rebuilding does not duplicate the overlay; existing output files are never overwritten.
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

Official reference: https://support.google.com/blogger/answer/46888 (sections/widgets are replaced with matching div IDs); https://support.google.com/blogger/answer/176245 (theme HTML customization).
