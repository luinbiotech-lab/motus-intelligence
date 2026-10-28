"""Patch an exported Blogger XML without rewriting any original widget/settings bytes.

Offline only. Never uploads, authenticates, publishes, or overwrites the input.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'design/blogger-theme'
B = '{http://www.google.com/2005/gml/b}'
BLOCKS = ('HEAD', 'TOP', 'FOOTER')

def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def block(name, content):
    return f'<!-- MOTUS-{name}-START -->{content}<!-- MOTUS-{name}-END -->'

def strip_overlay(text):
    present = [name for name in BLOCKS if f'MOTUS-{name}-' in text]
    if present and len(present) != len(BLOCKS):
        raise ValueError('INCOMPLETE_MOTUS_OVERLAY')
    for name in BLOCKS:
        start, end = f'<!-- MOTUS-{name}-START -->', f'<!-- MOTUS-{name}-END -->'
        if name in present and (text.count(start) != 1 or text.count(end) != 1 or text.index(end) < text.index(start)):
            raise ValueError('MOTUS_OVERLAY_MARKERS_INVALID')
        text = re.sub(r'<!-- MOTUS-' + name + r'-START -->[\s\S]*?<!-- MOTUS-' + name + r'-END -->', '', text)
    return text

def parse(text):
    if re.search(r'<!ENTITY\b|<!DOCTYPE\s+[^>]*\[', text, re.I):
        raise ValueError('DTD_ENTITIES_UNSUPPORTED')
    root = ET.fromstring(text)
    if root.tag not in ('html', '{http://www.w3.org/1999/xhtml}html'):
        raise ValueError('BLOGGER_HTML_REQUIRED')
    widgets = root.findall('.//' + B + 'widget')
    if not any(w.get('id') == 'Blog1' and w.get('type') == 'Blog' for w in widgets):
        raise ValueError('BLOG1_WIDGET_REQUIRED')
    if len(root.findall('.//' + B + 'skin')) != 1:
        raise ValueError('ONE_BLOGGER_SKIN_REQUIRED')
    # Includables are template definitions, not simultaneously rendered DOM.
    # Contempo's commentForm/threadedCommentForm legitimately share HTML IDs.
    # Keep widget/section identities global; validate HTML IDs per definition.
    global_ids = set()
    def check_ids(node, scope):
        if node.tag == B + 'includable':
            scope = set()
        elif node.get('id'):
            target = global_ids if node.tag in (B + 'widget', B + 'section') else scope
            if node.get('id') in target:
                raise ValueError('DUPLICATE_ID')
            target.add(node.get('id'))
        for child in node:
            check_ids(child, scope)
    check_ids(root, global_ids)
    return root, widgets

def build_theme(original):
    baseline = strip_overlay(original)
    _, widgets = parse(baseline)
    # Add a style element after the existing skin/head content: original variables and CSS are untouched.
    css = (ASSETS / 'motus.css').read_text(encoding='utf-8')
    if ']]>' in css:
        raise ValueError('CSS_CDATA_TERMINATOR')
    # Blogger preserves CDATA delimiters in the HTML response. CSS comments
    # make them harmless in HTML while remaining valid XML CDATA wrappers.
    head = block('HEAD', "<style id='motus-theme-overlay' type='text/css'>/*<![CDATA[*/" + css + '/*]]>*/</style>')
    top = block('TOP', (ASSETS / 'masthead.xml').read_text(encoding='utf-8'))
    foot = block('FOOTER', (ASSETS / 'footer.xml').read_text(encoding='utf-8'))
    if len(re.findall(r'</head\s*>', baseline)) != 1 or len(re.findall(r'<body\b[^>]*>', baseline)) != 1 or len(re.findall(r'</body\s*>', baseline)) != 1:
        raise ValueError('UNAMBIGUOUS_HEAD_BODY_REQUIRED')
    result = re.sub(r'</head\s*>', lambda m: head + m[0], baseline, count=1)
    result = re.sub(r'<body\b[^>]*>', lambda m: m[0] + top, result, count=1)
    result = re.sub(r'</body\s*>', lambda m: foot + m[0], result, count=1)
    _, after_widgets = parse(result)
    if strip_overlay(result) != baseline:
        raise ValueError('ORIGINAL_TEMPLATE_CHANGED')
    if [ET.tostring(w) for w in widgets] != [ET.tostring(w) for w in after_widgets]:
        raise ValueError('WIDGET_CONTENT_CHANGED')
    return result, {'baselineSha256': digest(baseline), 'outputSha256': digest(result),
                    'widgetIds': [w.get('id') for w in widgets], 'originalBytesPreserved': True,
                    'xmlParse': 'PASS', 'bloggerImport': 'NOT_VERIFIED', 'liveApplied': False,
                    'claudeReview': 'PENDING'}

def verify_candidate(original, candidate, manifest):
    """Read-only pre-upload check; refuse changed backups, files, or stale design assets."""
    if manifest.get('inputSha256') != digest(original):
        raise ValueError('BACKUP_HASH_MISMATCH')
    if manifest.get('outputSha256') != digest(candidate):
        raise ValueError('CANDIDATE_HASH_MISMATCH')
    if strip_overlay(candidate) != strip_overlay(original):
        raise ValueError('ORIGINAL_TEMPLATE_CHANGED')
    expected, report = build_theme(original)
    if candidate != expected:
        raise ValueError('CANDIDATE_ASSETS_OUTDATED')
    if manifest.get('baselineSha256') != report['baselineSha256'] or manifest.get('widgetIds') != report['widgetIds']:
        raise ValueError('VERIFICATION_MANIFEST_MISMATCH')
    return {'backupMatches': True, 'candidateMatches': True, 'originalBytesPreserved': True,
            'currentDesignMatches': True, 'bloggerImport': 'NOT_VERIFIED', 'liveApplied': False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True, help='Real exported Blogger XML backup')
    parser.add_argument('--output', type=Path, required=True, help='New candidate XML; must not already exist')
    parser.add_argument('--verify-manifest', type=Path, help='Verify an existing candidate and manifest without writing files')
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error('Backup must never be overwritten')
    report = args.output.with_suffix('.verification.json')
    if args.verify_manifest:
        with args.input.open('r', encoding='utf-8', newline='') as source:
            original = source.read()
        with args.output.open('r', encoding='utf-8', newline='') as source:
            candidate = source.read()
        manifest = json.loads(args.verify_manifest.read_text(encoding='utf-8'))
        print(json.dumps(verify_candidate(original, candidate, manifest), ensure_ascii=False))
        return
    if args.output.exists() or report.exists():
        parser.error('Output or verification already exists; choose a new version path')
    # newline="" preserves original CRLF and permits an exact inverse patch.
    with args.input.open('r', encoding='utf-8', newline='') as source:
        original = source.read()
    output, verification = build_theme(original)
    verification['inputSha256'] = digest(original)
    verification['backupFile'] = args.input.name
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8', newline='') as target:
        target.write(output)
    with report.open('x', encoding='utf-8') as target:
        json.dump(verification, target, ensure_ascii=False, indent=2)
    print(json.dumps(verification, ensure_ascii=False))

if __name__ == '__main__':
    main()
