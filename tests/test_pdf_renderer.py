"""Actual PDF rendering regression. Requires reportlab/pypdf and licensed Korean TTFs."""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from datetime import date, timedelta

spec=importlib.util.spec_from_file_location('renderer',Path(__file__).resolve().parent.parent/'scripts/render-motus-pdf.py')
renderer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)

@unittest.skipUnless(os.environ.get('MOTUS_PDF_FONT_REGULAR') and os.environ.get('MOTUS_PDF_FONT_BOLD'),'Set Korean TTF paths for render checks')
class PdfRendererTests(unittest.TestCase):
    def test_zero_three_four_charts_and_period_label(self):
        fonts=renderer.register_fonts()
        dates=[str(date(2026,7,1)+timedelta(days=i)) for i in range(63)]
        for count in [0,3,4]:
            with self.subTest(chartCount=count), tempfile.TemporaryDirectory() as root:
                vm={'displayTitle':'미국증시 (U.S. Market)','subtitle':'테스트 데이터로만 검사하는 PDF 렌더러','issueDate':'2026-10-26','reportType':'US_MARKET_DAILY','previewOnly':True,'charts':[{'title':name,'labels':dates,'values':[100+i for i in range(63)],'latestValue':'162.00','change':'+0.62%','direction':'UP','sourceLabel':'SYNTHETIC TEST'} for name in ['S&P 500','Nasdaq','Dow Jones','Russell 2000'][:count]],'sections':[{'title':'시장 요약','items':['합성 데이터로 차트 수와 한글 렌더링을 검증한다.']},{'title':'없는 자료','items':[]}],'sources':[{'label':'테스트 출처','url':'https://www.nyse.com/markets/hours-calendars'}]}
                output=str(Path(root)/'test.pdf')
                renderer.MotusDoc(output,vm).build(renderer.build_story(vm))
                result=renderer.validate(output,vm,fonts)
                self.assertEqual(result['status'],'PASS',result['errors'])
                reader=renderer.PdfReader(output)
                text=''.join(p.extract_text() for p in reader.pages)
                if count:
                    self.assertIn('63거래일',text)
                    self.assertNotIn('5거래일',text)
                self.assertNotIn('없는 자료',text)
                self.assertTrue(result['checks']['fontEmbedded'])

if __name__=='__main__': unittest.main()
