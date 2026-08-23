import os, sys, re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, HRFlowable, KeepTogether
from reportlab.lib import colors
from docx import Document
from docx.shared import Pt, Inches, RGBColor

PDF_PATH = r'C:\Users\VishwajeetUsnale\Downloads\PROJECT_GUIDE_Comprehensive_20_Pages.pdf'
DOCX_PATH = r'C:\Users\VishwajeetUsnale\Downloads\PROJECT_GUIDE_Comprehensive_20_Pages.docx'

print('Header initialized')

elements = []

def add_t(title, sub):
    elements.append(('title', title, sub))

def add_h1(text):
    elements.append(('h1', text))

def add_h2(text):
    elements.append(('h2', text))

def add_p(text):
    elements.append(('p', text))

def add_b(text):
    elements.append(('bullet', text))

def add_c(code):
    elements.append(('code', code))

def add_tbl(h, r):
    elements.append(('tbl', h, r))

def add_pb():
    elements.append(('pb', ''))

print("Elements array initialized")

