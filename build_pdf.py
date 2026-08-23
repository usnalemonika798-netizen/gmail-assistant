import os
import re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib import colors

pdf_path = r'C:\Users\VishwajeetUsnale\Downloads\PROJECT_GUIDE_College_Review.pdf'
guide_md = r'c:\Gmail Ai\PROJECT_GUIDE.md'

with open(guide_md, 'r', encoding='utf-8') as f:
    text = f.read()

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=colors.HexColor('#1e3a8a'), alignment=TA_CENTER, spaceAfter=8
)
h1_style = ParagraphStyle(
    'SectionH1', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=colors.HexColor('#0f172a'), spaceBefore=12, spaceAfter=6, keepWithNext=True
)
h2_style = ParagraphStyle(
    'SectionH2', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=10.5, leading=14, textColor=colors.HexColor('#1e40af'), spaceBefore=8, spaceAfter=4, keepWithNext=True
)
body_style = ParagraphStyle(
    'BodyDark', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=colors.HexColor('#334155'), spaceAfter=4
)
code_style = ParagraphStyle(
    'CodeSnippet', parent=styles['Normal'], fontName='Courier', fontSize=8, leading=10.5, textColor=colors.HexColor('#0f172a'), backColor=colors.HexColor('#f1f5f9'), borderColor=colors.HexColor('#cbd5e1'), borderWidth=0.5, borderPadding=4, spaceAfter=6
)
bullet_style = ParagraphStyle(
    'BulletItem', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=colors.HexColor('#334155'), leftIndent=12, firstLineIndent=-8, spaceAfter=3
)
alert_style = ParagraphStyle(
    'AlertBox', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=9, leading=13, textColor=colors.HexColor('#991b1b'), backColor=colors.HexColor('#fef2f2'), borderColor=colors.HexColor('#fca5a5'), borderWidth=0.8, borderPadding=6, spaceAfter=8
)

story = []
lines = text.split('\n')
in_code = False
code_buffer = []

def clean_txt(t):
    t = t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    t = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'\*(.*?)\*', r'<i>\1</i>', t)
    t = re.sub(r'(.*?)', r'<font face= Courier color=#1e40af>\1</font>', t)
    return t

for line in lines:
    sline = line.strip()
    if sline.startswith('`'):
        if in_code:
            in_code = False
            code_text = '<br/>'.join([clean_txt(l) for l in code_buffer])
            story.append(Paragraph(code_text, code_style))
            code_buffer = []
        else:
            in_code = True
        continue
    
    if in_code:
        code_buffer.append(line)
        continue

    if not sline:
        story.append(Spacer(1, 3))
        continue

    if sline.startswith('# '):
        story.append(Paragraph(clean_txt(sline[2:]), title_style))
    elif sline.startswith('## '):
        story.append(Paragraph(clean_txt(sline[3:]), h1_style))
        story.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#cbd5e1'), spaceBefore=2, spaceAfter=6))
    elif sline.startswith('### '):
        story.append(Paragraph(clean_txt(sline[4:]), h2_style))
    elif sline.startswith('---'):
        story.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#e2e8f0'), spaceBefore=4, spaceAfter=4))
    elif sline.startswith('> '):
        story.append(Paragraph(clean_txt(sline[2:]), alert_style))
    elif sline.startswith('- ') or sline.startswith('* '):
        story.append(Paragraph('&bull; ' + clean_txt(sline[2:]), bullet_style))
    elif re.match(r'^\d+\.\s', sline):
        story.append(Paragraph(clean_txt(sline), bullet_style))
    else:
        story.append(Paragraph(clean_txt(sline), body_style))

doc = SimpleDocTemplate(
    pdf_path, pagesize=A4, rightMargin=0.5*inch, leftMargin=0.5*inch, topMargin=0.5*inch, bottomMargin=0.5*inch
)

def add_header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor('#64748b'))
    canvas.drawString(0.5*inch, 0.3*inch, 'Gmail AI Assistant & SQL Agent - Project Guide & Review Preparation')
    canvas.drawRightString(A4[0] - 0.5*inch, 0.3*inch, f'Page {doc.page}')
    canvas.setStrokeColor(colors.HexColor('#e2e8f0'))
    canvas.setLineWidth(0.5)
    canvas.line(0.5*inch, 0.4*inch, A4[0] - 0.5*inch, 0.4*inch)
    canvas.restoreState()

doc.build(story, onFirstPage=add_header_footer, onLaterPages=add_header_footer)
print('PDF generated successfully:', pdf_path)
