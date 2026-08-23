# Full Generator Script for 20+ Page PDF & DOCX Project Guide
import os, sys, re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, HRFlowable, KeepTogether
)
from reportlab.lib import colors

from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

PDF_PATH = r'C:\Users\VishwajeetUsnale\Downloads\PROJECT_GUIDE_Comprehensive_20_Pages.pdf'
DOCX_PATH = r'C:\Users\VishwajeetUsnale\Downloads\PROJECT_GUIDE_Comprehensive_20_Pages.docx'

print('Script header initialized')
