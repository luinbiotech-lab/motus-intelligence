"""Synthetic XML fixture tests, not evidence of a real Blogger import."""
import importlib.util
import unittest
import json
import subprocess
import sys
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('theme', Path(__file__).resolve().parent.parent / 'scripts/build-blogger-theme.py')
theme = importlib.util.module_from_spec(spec)
spec.loader.exec_module(theme)
FIXTURE = """<?xml version='1.0' encoding='UTF-8'?>
<html xmlns='http://www.w3.org/1999/xhtml' xmlns:b='http://www.google.com/2005/gml/b' xmlns:expr='http://www.google.com/2005/gml/expr' xmlns:data='http://www.google.com/2005/gml/data'>
<head><b:include data='blog' name='all-head-content'/><b:skin><![CDATA[body{color:red}]]></b:skin><script>analytics_fixture()</script></head>
<body class='container'><b:section id='main'><b:widget id='Blog1' type='Blog' version='2'><b:includable id='main'><data:post.body/></b:includable></b:widget></b:section><b:section id='sidebar'><b:widget id='BlogArchive1' type='BlogArchive'/><b:widget id='Label1' type='Label'/></b:section></body></html>"""

class ThemeTests(unittest.TestCase):
    def test_exact_inverse_and_widget_preservation(self):
        output, report = theme.build_theme(FIXTURE)
        self.assertEqual(theme.strip_overlay(output), FIXTURE)
        self.assertEqual(report['widgetIds'], ['Blog1', 'BlogArchive1', 'Label1'])
        self.assertTrue(report['originalBytesPreserved'])
        self.assertFalse(report['liveApplied'])
        self.assertIn("data:blog.url == data:blog.homepageUrl", output)
        self.assertIn("name='all-head-content'", output)
    def test_repeat_build_is_idempotent(self):
        first, _ = theme.build_theme(FIXTURE)
        second, _ = theme.build_theme(first)
        self.assertEqual(first, second)
    def test_crlf_round_trip(self):
        xml = FIXTURE.replace('\n', '\r\n')
        self.assertEqual(theme.strip_overlay(theme.build_theme(xml)[0]), xml)
    def test_missing_blog_or_skin_rejected(self):
        for xml in [FIXTURE.replace("id='Blog1'", "id='Other'"), FIXTURE.replace('b:skin', 'b:other')]:
            with self.assertRaises(ValueError): theme.build_theme(xml)
    def test_duplicate_widget_rejected(self):
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_ID'):
            theme.build_theme(FIXTURE.replace("id='Label1'", "id='Blog1'"))
    def test_malformed_xml_and_entities_rejected(self):
        for xml in [FIXTURE.replace('</body>', ''), '<!DOCTYPE html [<!ENTITY bad "bad">]>' + FIXTURE]:
            with self.assertRaises(Exception): theme.build_theme(xml)
    def test_non_html_root_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'BLOGGER_HTML_REQUIRED'):
            theme.build_theme(FIXTURE.replace('<html ', '<nothtml ').replace('</html>', '</nothtml>'))
    def test_overlay_must_be_complete_and_unique(self):
        output, _ = theme.build_theme(FIXTURE)
        for xml in [output.replace('<!-- MOTUS-HEAD-END -->', ''), output + '<!-- MOTUS-HEAD-START -->', output.replace('<!-- MOTUS-FOOTER-START -->', '<!-- OTHER-START -->')]:
            with self.assertRaises(ValueError): theme.build_theme(xml)
    def test_includable_ids_are_scoped_to_each_widget(self):
        xml = FIXTURE.replace("<b:widget id='Label1' type='Label'/>", "<b:widget id='Label1' type='Label'><b:includable id='main'><span>Labels</span></b:includable></b:widget>")
        self.assertEqual(theme.strip_overlay(theme.build_theme(xml)[0]), xml)
    def test_preupload_verification_detects_modified_candidate_and_backup(self):
        output, manifest = theme.build_theme(FIXTURE)
        manifest['inputSha256'] = theme.digest(FIXTURE)
        self.assertTrue(theme.verify_candidate(FIXTURE, output, manifest)['candidateMatches'])
        with self.assertRaisesRegex(ValueError, 'CANDIDATE_HASH_MISMATCH'):
            theme.verify_candidate(FIXTURE, output.replace('INTELLIGENCE', 'BROKEN', 1), manifest)
        with self.assertRaisesRegex(ValueError, 'BACKUP_HASH_MISMATCH'):
            theme.verify_candidate(FIXTURE.replace('color:red', 'color:blue'), output, manifest)
    def test_cli_preserves_backup_refuses_overwrite_and_supports_readonly_verification(self):
        script = str(theme.ROOT / 'scripts/build-blogger-theme.py')
        with tempfile.TemporaryDirectory() as folder:
            backup = Path(folder) / 'backup.xml'
            candidate = Path(folder) / 'candidate.xml'
            manifest = candidate.with_suffix('.verification.json')
            original_bytes = FIXTURE.replace('\n', '\r\n').encode('utf-8')
            backup.write_bytes(original_bytes)
            command = [sys.executable, script, '--input', str(backup), '--output', str(candidate)]
            built = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(built.returncode, 0, built.stderr)
            candidate_bytes = candidate.read_bytes()
            self.assertEqual(backup.read_bytes(), original_bytes)
            refused = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            verified = subprocess.run(command + ['--verify-manifest', str(manifest)], capture_output=True, text=True)
            self.assertEqual(verified.returncode, 0, verified.stderr)
            self.assertTrue(json.loads(verified.stdout)['originalBytesPreserved'])
            self.assertEqual(candidate.read_bytes(), candidate_bytes)
            self.assertEqual(backup.read_bytes(), original_bytes)

if __name__ == '__main__': unittest.main()
