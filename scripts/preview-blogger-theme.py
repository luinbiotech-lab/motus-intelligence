"""Render an offline design preview from a saved, already-published live-unit.
This never contacts Blogger and does not prove live XML compatibility.
"""
import argparse
import html
import json
import re
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / 'design/blogger-theme'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--published-unit', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    unit = json.loads(args.published_unit.read_text(encoding='utf-8'))
    title = html.escape(unit['title'])
    date = html.escape(unit['observedDate'])
    article = re.search(r'<article\b[\s\S]*?</article>', unit['render']['html']).group(0)
    lead = re.search(r'<p\b[^>]*data-section="editorial-lead"[^>]*>([\s\S]*?)</p>', article)
    summary = lead.group(1) if lead else ''
    masthead = (ASSETS / 'masthead.xml').read_text(encoding='utf-8').replace("expr:href='data:blog.homepageUrl'", "href='https://motusnova.blogspot.com/'")
    home = re.sub(r'</?b:if\b[^>]*>', '', masthead)
    article_head = re.sub(r'<b:if\b[\s\S]*?</b:if>', '', masthead)
    footer = (ASSETS / 'footer.xml').read_text(encoding='utf-8')
    css = (ASSETS / 'motus.css').read_text(encoding='utf-8')
    badge = '<aside style="padding:10px 16px;background:#FFF1D5;color:#654000;font:12px/1.6 Arial,sans-serif">디자인 검토용 · 운영 미적용 · 2026-10-27 발행 기록 재현 / 수치 독립검증 미완료</aside>'
    def document(top, content):
        return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOTUS 테마 검토</title><style>' + css + '</style></head><body>' + badge + top + '<main class="motus-wrap" id="Blog1">' + content + '</main>' + footer + '</body></html>'
    args.output_dir.mkdir(parents=True, exist_ok=True)
    home_story = '<article class="post-outer-container"><p class="motus-kicker" style="color:#285D91">미국증시 · ' + date + '</p><h2 class="post-title"><a href="https://motusnova.blogspot.com/2026/10/nasdaq.html">' + title + '</a></h2><div class="post-body"><p>' + summary + '</p></div><a href="https://motusnova.blogspot.com/2026/10/nasdaq.html">기사 읽기 →</a></article>'
    (args.output_dir / 'preview.html').write_text(document(home, home_story), encoding='utf-8')
    (args.output_dir / 'preview-article.html').write_text(document(article_head, '<div class="post-outer-container post-body">' + article + '</div>'), encoding='utf-8')
    print('Offline previews written. Live rendering remains NOT VERIFIED.')

if __name__ == '__main__': main()
