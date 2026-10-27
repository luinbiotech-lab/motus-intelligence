"""Synthetic XML fixture tests, not evidence of a real Blogger import."""
import importlib.util
import unittest
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

if __name__ == '__main__': unittest.main()
