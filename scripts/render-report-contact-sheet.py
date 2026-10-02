import argparse, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import pypdfium2 as pdfium

NAVY=(3,22,46); OFF=(247,249,252); SLATE=(89,105,125); BORDER=(196,207,219)

def font(size,bold=False):
    path=Path(r'C:\Windows\Fonts\malgunbd.ttf' if bold else r'C:\Windows\Fonts\malgun.ttf')
    return ImageFont.truetype(str(path),size)

def render(pdf_path,output,title):
    pdf=pdfium.PdfDocument(pdf_path);pages=[]
    for index in range(len(pdf)):
        bitmap=pdf[index].render(scale=1.65);image=bitmap.to_pil().convert('RGB');pages.append(image)
    if not pages:raise RuntimeError('contact sheet requires at least one page')
    columns=1 if len(pages)==1 else 2;rows=math.ceil(len(pages)/columns);thumb_width=930;header=92;gutter=28;label=40
    ratio=pages[0].height/pages[0].width;thumb_height=int(thumb_width*ratio)
    canvas=Image.new('RGB',(gutter+columns*(thumb_width+gutter),header+gutter+rows*(thumb_height+label+gutter)),OFF);draw=ImageDraw.Draw(canvas)
    draw.rectangle((0,0,canvas.width,header),fill=NAVY);draw.text((gutter,18),'MOTUS | PDF HUMAN REVIEW',font=font(22,True),fill='white');draw.text((gutter,51),title,font=font(16),fill=(216,230,243))
    for index,page in enumerate(pages):
        row=index//columns;column=index%columns;x=gutter+column*(thumb_width+gutter);y=header+gutter+row*(thumb_height+label+gutter)
        thumb=page.resize((thumb_width,thumb_height),Image.Resampling.LANCZOS);canvas.paste(thumb,(x,y));draw.rectangle((x,y,x+thumb_width,y+thumb_height),outline=BORDER,width=2);draw.text((x,y+thumb_height+7),f'Page {index+1}',font=font(15,True),fill=SLATE)
    Path(output).parent.mkdir(parents=True,exist_ok=True);canvas.save(output,optimize=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--pdf',required=True);parser.add_argument('--output',required=True);parser.add_argument('--title',required=True);args=parser.parse_args();render(args.pdf,args.output,args.title)
    print(f'CONTACT_SHEET=PASS pages={len(pdfium.PdfDocument(args.pdf))} output={args.output}')

if __name__=='__main__':main()
