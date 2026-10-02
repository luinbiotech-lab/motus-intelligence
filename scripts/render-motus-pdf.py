import argparse, json, os, re, sys
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.graphics.shapes import Drawing, Line, PolyLine, Circle, String
from pypdf import PdfReader
import pdfplumber
from urllib.parse import urlparse

NAVY=colors.HexColor('#03162e'); SLATE=colors.HexColor('#59697d'); BLUE=colors.HexColor('#1565c0'); RED=colors.HexColor('#c62828'); OFF=colors.HexColor('#f7f9fc'); BORDER=colors.HexColor('#c4cfdb')
MIN_BODY_FONT_PT=8.0; BODY_FONT_PT=8.6

def register_fonts():
    regular=Path(r'C:\Windows\Fonts\malgun.ttf'); bold=Path(r'C:\Windows\Fonts\malgunbd.ttf')
    if not regular.exists() or not bold.exists(): raise RuntimeError('Korean system font not found')
    pdfmetrics.registerFont(TTFont('MOTUS-KR',str(regular)));pdfmetrics.registerFont(TTFont('MOTUS-KR-Bold',str(bold)))
    return [str(regular),str(bold)]

def esc(value):
    return str(value).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

def chart_card(series):
    width,height=78*mm,39*mm;d=Drawing(width,height)
    d.add(String(5,height-12,series['title'],fontName='MOTUS-KR-Bold',fontSize=8.3,fillColor=NAVY))
    d.add(String(width-5,height-12,f"{series['latestValue']}  {series['change']}",fontName='MOTUS-KR-Bold',fontSize=7.5,textAnchor='end',fillColor=RED if series['direction']=='UP' else BLUE if series['direction']=='DOWN' else SLATE))
    values=series['values'];left,right,bottom,top=7,width-7,12,height-19
    for y in [bottom,(bottom+top)/2,top]:d.add(Line(left,y,right,y,strokeColor=colors.HexColor('#dce3eb'),strokeWidth=.5))
    lo,hi=min(values),max(values);span=hi-lo or 1;points=[]
    for i,value in enumerate(values):
        x=left+(right-left)*(i/(len(values)-1 if len(values)>1 else 1));y=bottom+(top-bottom)*(value-lo)/span;points.extend([x,y]);d.add(Circle(x,y,1.4,fillColor=NAVY,strokeColor=NAVY))
    d.add(PolyLine(points,strokeColor=colors.HexColor('#456b91'),strokeWidth=1.8))
    d.add(String(left,6,series['labels'][0][5:],fontName='MOTUS-KR',fontSize=5.8,fillColor=SLATE));d.add(String(right,6,series['labels'][-1][5:],fontName='MOTUS-KR',fontSize=5.8,fillColor=SLATE,textAnchor='end'));d.add(String(left,0,series['sourceLabel'],fontName='MOTUS-KR',fontSize=4.8,fillColor=SLATE))
    return d

def styles():
    base=getSampleStyleSheet();return {
      'title':ParagraphStyle('title',parent=base['Title'],fontName='MOTUS-KR-Bold',fontSize=20,leading=25,textColor=colors.white,spaceAfter=3),
      'subtitle':ParagraphStyle('subtitle',fontName='MOTUS-KR',fontSize=9.5,leading=14,textColor=colors.HexColor('#d8e6f3')),
      'section':ParagraphStyle('section',fontName='MOTUS-KR-Bold',fontSize=11,leading=14,textColor=colors.white),
      'body':ParagraphStyle('body',fontName='MOTUS-KR',fontSize=BODY_FONT_PT,leading=12.5,textColor=colors.HexColor('#172033'),spaceAfter=4),
      'small':ParagraphStyle('small',fontName='MOTUS-KR',fontSize=7,leading=10,textColor=SLATE),
      'source':ParagraphStyle('source',fontName='MOTUS-KR',fontSize=6.4,leading=8.4,textColor=SLATE),
    }

class MotusDoc(BaseDocTemplate):
    def __init__(self,path,vm):
        super().__init__(path,pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,topMargin=14*mm,bottomMargin=14*mm,title=vm['displayTitle'],author='MOTUS')
        self.vm=vm;frame=Frame(self.leftMargin,self.bottomMargin,self.width,self.height,id='content');self.addPageTemplates(PageTemplate(id='motus',frames=frame,onPage=self.footer))
    def footer(self,canvas,doc):
        canvas.saveState();canvas.setStrokeColor(BORDER);canvas.line(15*mm,10*mm,A4[0]-15*mm,10*mm);canvas.setFont('MOTUS-KR',6.5);canvas.setFillColor(SLATE);canvas.drawString(15*mm,6.3*mm,'MOTUS | What Moves the World · 검증된 자료 기반 · 투자 권유 아님');canvas.drawRightString(A4[0]-15*mm,6.3*mm,f'{doc.page}');canvas.restoreState()

def build_story(vm):
    s=styles();story=[]
    header=Table([[Paragraph('MOTUS | What Moves the World',s['small'])],[Paragraph(esc(vm['displayTitle']),s['title'])],[Paragraph(f"{esc(vm['subtitle'])}<br/>{vm['issueDate']}",s['subtitle'])]],colWidths=[A4[0]-30*mm]);header.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),NAVY),('BOX',(0,0),(-1,-1),.7,colors.HexColor('#010b17')),('LEFTPADDING',(0,0),(-1,-1),10*mm),('RIGHTPADDING',(0,0),(-1,-1),10*mm),('TOPPADDING',(0,0),(-1,-1),2.5*mm),('BOTTOMPADDING',(0,0),(-1,-1),2.5*mm)]));story.extend([header,Spacer(1,3*mm)])
    if vm.get('previewOnly'):
        badge=Table([[Paragraph('SAMPLE / PREVIEW · 현재 운영 readiness가 HOLD이므로 production 배포 대상이 아님',s['body'])]],colWidths=[A4[0]-30*mm]);badge.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#fff4e5')),('BOX',(0,0),(-1,-1),.7,colors.HexColor('#b7791f')),('PADDING',(0,0),(-1,-1),3*mm)]));story.extend([badge,Spacer(1,3*mm)])
    if vm.get('charts'):
        cards=[chart_card(item) for item in vm['charts']];grid=Table([[cards[0],cards[1]],[cards[2],cards[3]]],colWidths=[(A4[0]-34*mm)/2]*2,rowHeights=[42*mm,42*mm]);grid.setStyle(TableStyle([('BOX',(0,0),(-1,-1),.6,BORDER),('INNERGRID',(0,0),(-1,-1),.6,BORDER),('BACKGROUND',(0,0),(-1,-1),OFF),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),1.5*mm),('RIGHTPADDING',(0,0),(-1,-1),1.5*mm)]));story.extend([KeepTogether([section_bar('미국 주요지수 5거래일',s),grid]),Spacer(1,3*mm)])
    for section in vm['sections']:
        items=[]
        for text in section['items']:
            color=RED if re.search(r'\+|순매수|상승',text) else BLUE if re.search(r'-|순매도|하락',text) else colors.HexColor('#172033')
            pstyle=ParagraphStyle('directional',parent=s['body'],textColor=color if section['title']=='투자자 수급' else colors.HexColor('#172033'))
            items.append(Paragraph('• '+esc(text),pstyle))
        box=Table([[item] for item in items],colWidths=[A4[0]-34*mm]);box.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.white),('BOX',(0,0),(-1,-1),.6,BORDER),('LEFTPADDING',(0,0),(-1,-1),4*mm),('RIGHTPADDING',(0,0),(-1,-1),4*mm),('TOPPADDING',(0,0),(-1,-1),1.2*mm),('BOTTOMPADDING',(0,0),(-1,-1),1.2*mm)]));story.extend([KeepTogether([section_bar(section['title'],s),box]),Spacer(1,1.7*mm)])
    source_lines=[Paragraph(f"{esc(src['label'])} · {esc(re.sub(r'^www\\.','',urlparse(src['url']).hostname or 'source'))}",s['source']) for src in vm['sources']]
    if source_lines:
        box=Table([[line] for line in source_lines],colWidths=[A4[0]-34*mm]);box.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),OFF),('BOX',(0,0),(-1,-1),.6,BORDER),('LEFTPADDING',(0,0),(-1,-1),4*mm),('RIGHTPADDING',(0,0),(-1,-1),4*mm),('TOPPADDING',(0,0),(-1,-1),1*mm),('BOTTOMPADDING',(0,0),(-1,-1),1*mm)]));story.append(KeepTogether([section_bar('주요 출처 / Sources',s),box]))
    return story

def section_bar(title,s):
    table=Table([[Paragraph(esc(title),s['section'])]],colWidths=[A4[0]-34*mm]);table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#17283d')),('BOX',(0,0),(-1,-1),.7,NAVY),('LEFTPADDING',(0,0),(-1,-1),4*mm),('RIGHTPADDING',(0,0),(-1,-1),4*mm),('TOPPADDING',(0,0),(-1,-1),1.5*mm),('BOTTOMPADDING',(0,0),(-1,-1),1.5*mm)]));return table

def validate(path,vm,font_paths):
    errors=[];warnings=[];p=Path(path);exists=p.exists();size=p.stat().st_size if exists else 0;signature=exists and p.read_bytes()[:5]==b'%PDF-';pages=0;text='';font_names=[]
    if exists and signature:
        reader=PdfReader(path);pages=len(reader.pages)
        for page in reader.pages:
            resources=page.get('/Resources',{});fonts=resources.get('/Font',{}) if resources else {}
            for ref in fonts.values():
                obj=ref.get_object();name=str(obj.get('/BaseFont',''));font_names.append(name)
        with pdfplumber.open(path) as doc:text='\n'.join((page.extract_text() or '') for page in doc.pages)
    checks={'fileExists':exists,'nonZeroSize':size>0,'validPdfSignature':signature,'pageCount':pages>=1,'textExtraction':len(text)>50,'koreanText':bool(re.search(r'[가-힣]',text)),'motusTitle':'MOTUS' in text,'issueDate':vm['issueDate'] in text,'noInternalIds':not bool(re.search(r'claimId|evidenceId|confidenceScore|sourceTier|MANUAL_VERIFIED|candidate_id',text,re.I)),'noRawSecret':not bool(re.search(r'access_token|refresh_token|client_secret|AIza[\w-]{20,}',text,re.I)),'noLocalhost':'localhost' not in text.lower() and '127.0.0.1' not in text,'noPlaceholder':not bool(re.search(r'placeholder|example\.com',text,re.I)),'noFixtureLabel':not bool(re.search(r'\bfixture\b',text,re.I)),'overflow':pages<=2 if vm['reportType'].endswith('DAILY') else pages>=1,'charts':len(vm.get('charts',[])) in (0,4),'sources':'Sources' in text or '출처' in text,'fontEmbedded':any('MOTUS' in name or 'Malgun' in name for name in font_names),'minimumBodyFontSize':BODY_FONT_PT>=MIN_BODY_FONT_PT}
    for key,value in checks.items():
        if not value:errors.append(key)
    if vm['reportType'].endswith('DAILY') and pages>1:warnings.append('Daily report used 2-page fallback')
    return {'status':'PASS' if not errors else 'FAIL','checks':checks,'warnings':warnings,'errors':errors,'extractedTextLength':len(text),'fontNames':sorted(set(font_names)),'fontPaths':[Path(x).name for x in font_paths],'pageCount':pages,'fileSizeBytes':size}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--output',required=True);parser.add_argument('--validation',required=True);args=parser.parse_args()
    vm=json.loads(Path(args.input).read_text(encoding='utf-8'));Path(args.output).parent.mkdir(parents=True,exist_ok=True);fonts=register_fonts();doc=MotusDoc(args.output,vm);doc.build(build_story(vm));result=validate(args.output,vm,fonts);Path(args.validation).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'pdf':args.output,'validation':result['status'],'pages':result['pageCount'],'bytes':result['fileSizeBytes']},ensure_ascii=False))
    if result['status']!='PASS':sys.exit(2)

if __name__=='__main__':main()
