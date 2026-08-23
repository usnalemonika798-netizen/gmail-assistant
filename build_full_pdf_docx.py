import os, sys, re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, HRFlowable, KeepTogether
from reportlab.lib import colors
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

PDF_PATH = r" C:\\Users\\VishwajeetUsnale\\Downloads\\PROJECT_GUIDE_Comprehensive_20_Pages.pdf\n
story = []
styles = getSampleStyleSheet()

title_style = ParagraphStyle('DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=colors.HexColor('#1e3a8a'), alignment=TA_CENTER, spaceAfter=8)
subtitle_style = ParagraphStyle('DocSubTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, leading=15, textColor=colors.HexColor('#2563eb'), alignment=TA_CENTER, spaceAfter=15)
h1_style = ParagraphStyle('SectionH1', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=colors.HexColor('#0f172a'), spaceBefore=14, spaceAfter=6, keepWithNext=True)
h2_style = ParagraphStyle('SectionH2', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=10.5, leading=14, textColor=colors.HexColor('#1e40af'), spaceBefore=10, spaceAfter=4, keepWithNext=True)
h3_style = ParagraphStyle('SectionH3', parent=styles['Heading3'], fontName='Helvetica-Bold', fontSize=9.5, leading=13, textColor=colors.HexColor('#334155'), spaceBefore=8, spaceAfter=3, keepWithNext=True)
body_style = ParagraphStyle('BodyDark', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=colors.HexColor('#334155'), spaceAfter=5, alignment=TA_JUSTIFY)
code_style = ParagraphStyle('CodeSnippet', parent=styles['Normal'], fontName='Courier', fontSize=8, leading=10.5, textColor=colors.HexColor('#0f172a'), backColor=colors.HexColor('#f1f5f9'), borderColor=colors.HexColor('#cbd5e1'), borderWidth=0.5, borderPadding=4, spaceAfter=6)
bullet_style = ParagraphStyle('BulletItem', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=colors.HexColor('#334155'), leftIndent=12, firstLineIndent=-8, spaceAfter=3)
alert_style = ParagraphStyle('AlertBox', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=9, leading=13, textColor=colors.HexColor('#991b1b'), backColor=colors.HexColor('#fef2f2'), borderColor=colors.HexColor('#fca5a5'), borderWidth=0.8, borderPadding=6, spaceAfter=8)

doc_tree = []

def add_title(text, sub=''):
    doc_tree.append(('title', text, sub))

def add_h1(text):
    doc_tree.append(('h1', text))

def add_h2(text):
    doc_tree.append(('h2', text))

def add_h3(text):
    doc_tree.append(('h3', text))

def add_p(text):
    doc_tree.append(('p', text))

def add_bullet(text):
    doc_tree.append(('bullet', text))

def add_code(text):
    doc_tree.append(('code', text))

def add_alert(text):
    doc_tree.append(('alert', text))

def add_table(headers, rows):
    doc_tree.append(('table', headers, rows))

def add_pb():
    doc_tree.append(('pb', ''))

print('Tree builders defined')

# ─── CHAPTER POPULATION ────────────────────────────────────────────────────────

add_title('PROJECT MASTER GUIDE & REVIEW MANUAL', 'AI-Powered Gmail Assistant, Automated Triage & SQL Agent (20+ Page Edition)')

add_h1('1. EXECUTIVE OVERVIEW & PROBLEM FORMULATION')

add_h2('1.1 Problem Statement & Background')
add_p('In contemporary personal and professional productivity environments, electronic mail remains the foundational channel for official communication. However, modern knowledge workers face severe email overload. According to industry surveys, an average professional spends between 2.5 to 3.5 hours daily managing inbox correspondence. The cognitive load associated with reading long messages, evaluating urgency, composing professional replies, scheduling meeting follow-ups, and extracting critical tasks leads to context switching, missed deadlines, and lost productivity.')
add_p('Simultaneously, relational databases power almost every enterprise application. However, performing database operations (such as querying records, inserting new entries, or modifying existing data) traditionally requires knowledge of Structured Query Language (SQL) or technical interface tools. Non-technical stakeholders, such as managers, administrative staff, or students, are unable to interact directly with databases without relying on software engineering teams.')
add_p('This project bridges both gaps by engineering an integrated, dual-capability system: (1) an AI-powered Gmail Assistant that automates inbox analysis, email categorization (triage), context-aware reply generation, morning briefings, meeting scheduling, and mobile push notifications via Telegram; and (2) an AI SQL Agent that empowers users to execute database operations using plain English conversational sentences.')

add_h2('1.2 Primary System Objectives')
add_bullet('<b>Automated Inbox Triage:</b> Intelligently analyze incoming unread emails and categorize them into actionable buckets (Urgent, Job, Meeting, College, Noise, Other) with visual status badges.')
add_bullet('<b>Context-Aware AI Reply Generation:</b> Leverage Google Gemini Large Language Models to generate tailored, multi-tone email responses (Professional, Friendly, Brief) based on email content.')
add_bullet('<b>Seamless Email Dispatch:</b> Direct integration with Googles official Gmail API to send approved replies without leaving the application web interface.')
add_bullet('<b>Morning Inbox & Calendar Briefing:</b> Generate natural language daily summaries combining unread email insights with upcoming Google Calendar events.')
add_bullet('<b>Automated Google Meet Scheduling:</b> Extract meeting intent, date, and time from email bodies using AI, automatically create Google Calendar events with Google Meet video links, and pre-fill response templates.')
add_bullet('<b>Mobile Telegram Push Notification Engine:</b> Real-time background polling service running every 90 seconds that delivers important email alerts directly to Telegram with inline buttons for text and voice replies.')
add_bullet('<b>Conversational AI SQL Agent:</b> Tool-calling agentic workflow that converts natural language user prompts into safe database CRUD operations.')
add_bullet('<b>Dual-Engine Hybrid Database:</b> Dynamic failover database architecture supporting MySQL for production and zero-config SQLite3 for local development.')
add_bullet('<b>PDF Activity Reporting:</b> Programmatically export structured PDF summary reports detailing user communications and system analytics.')

add_h2('1.3 Target User Persona & Real-World Utility')
add_p('The primary beneficiaries of this system include: (1) Students and Faculty who receive high volumes of academic, assignment, and exam notices; (2) Working Professionals and Freelancers managing client inquiries and meeting schedules; (3) Business Owners and Non-Technical Administrators who require direct database querying without learning SQL syntax.')

print('Chapter 1 appended')

# ─── CHAPTER 2 & 3 ─────────────────────────────────────────────────────────────

add_h1('2. DOMAIN & FUNDAMENTAL COMPUTER SCIENCE CONCEPTS')

add_h2('2.1 Three-Tier Web Application Architecture')
add_p('Modern web software architecture relies on the classic 3-Tier model, which strictly decouples user interface, business logic, and data storage into discrete physical and logical layers:')
add_bullet('<b>Presentation Layer (Tier 1):</b> Implemented using React 18, Vite, and CSS3. Responsible for rendering UI components, capturing user interactions, managing local component state, and displaying asynchronous API responses.')
add_bullet('<b>Application Logic Layer (Tier 2):</b> Implemented using Node.js runtime and Express.js framework. Contains controller logic, security middleware (JWT/Bcrypt), service abstractions (Gmail, Calendar, Gemini, Telegram), and route handlers.')
add_bullet('<b>Data Tier (Tier 3):</b> Persistence layer utilizing MySQL or SQLite databases to store persistent user entities, credentials, OAuth token payloads, and demo domain tables.')

add_h2('2.2 Single Page Application (SPA) vs Multi-Page Application (MPA)')
add_p('Unlike traditional Multi-Page Applications (MPAs) where every navigation request causes the browser to reload an entirely new HTML document from the server, this project is built as a Single Page Application (SPA). React Router DOM handles client-side routing by dynamically swapping components in the DOM without triggering a page refresh. This produces a fluid, desktop-like user experience with zero flicker during view transitions.')

add_h2('2.3 RESTful API Paradigm & HTTP Protocol')
add_p('Communication between the React frontend and Node.js backend adheres to Representational State Transfer (REST) principles. Standard HTTP verbs are utilized according to semantic conventions:')
add_bullet('<b>GET:</b> Idempotent retrieval of resources (e.g., GET /api/gmail/unread, GET /api/auth/me).')
add_bullet('<b>POST:</b> Creation of new entities or trigger actions (e.g., POST /api/auth/login, POST /api/gmail/generate-reply).')
add_bullet('<b>DELETE:</b> Removal of targeted resources (e.g., DELETE /api/calendar/events/:id).')

add_h2('2.4 Stateless Authentication vs Stateful Sessions')
add_p('Traditional web apps use server-side sessions stored in memory or Redis. This project employs JSON Web Tokens (JWT) for stateless authentication. When a user authenticates, the server signs a cryptographic payload containing user claims (ID, email) using a secret key and sends it to the client. The client stores the token in browser localStorage and includes it in the Authorization header of subsequent API calls. The server verifies the cryptographic signature without querying session storage, enabling linear horizontal scalability.')

add_h2('2.5 OAuth 2.0 Authorization Framework')
add_p('The Open Authorization 2.0 (OAuth 2.0) framework allows third-party applications to obtain limited access to user accounts on an HTTP service (such as Google). In this project, the Authorization Code Grant flow is used:')
add_bullet('1. User is redirected to Googles authorization server with requested scopes (Gmail, Calendar, Profile).')
add_bullet('2. User authenticates directly with Google and consents to permissions.')
add_bullet('3. Google redirects back to backend callback endpoint with an authorization code.')
add_bullet('4. Backend exchanges authorization code for short-lived access_token and long-lived refresh_token.')
add_bullet('5. Tokens are serialized as JSON and stored securely in the user database record.')

add_h2('2.6 Large Language Models (LLM) & Agentic Tool Calling')
add_p('Artificial Intelligence capabilities in this application are powered by Google Gemini AI. Beyond simple prompt-response completion, the AI SQL Agent utilizes Function Calling (Tool Use). The backend provides Gemini with formal JSON declarations of available database tools (read_records, create_record, update_record, delete_record). When the user asks a question in plain English, Gemini evaluates the intent and outputs a structured tool request instead of natural language text. The backend executes the corresponding database query and returns the tabular result back to Gemini, which synthesizes a human-readable final answer. This iterative loop is known as an Agentic Workflow.')


add_h1('3. EXHAUSTIVE TECHNOLOGY STACK & DEPENDENCY INVENTORY')

add_h2('3.1 Technology Matrix')
add_table(
    ['Layer', 'Technology', 'Version', 'Role & Rationale'],
    [
        ['Frontend UI', 'React.js', '18.x', 'Declarative, component-based UI rendering with virtual DOM'],
        ['Frontend Build', 'Vite', '5.x', 'Instant HMR dev server and fast ES module bundling'],
        ['Client Routing', 'React Router DOM', '6.x', 'Client-side SPA route matching and navigation guards'],
        ['HTTP Client', 'Axios', '1.x', 'Promise-based HTTP client for browser API requests'],
        ['Backend Runtime', 'Node.js', '20.x', 'Non-blocking, event-driven JavaScript server runtime'],
        ['Web Framework', 'Express.js', '4.x', 'Minimalist routing, middleware execution, REST API handling'],
        ['Auth Tokens', 'JSONWebToken', '9.x', 'HMAC SHA256 stateless token signing and verification'],
        ['Password Security', 'Bcrypt.js', '2.x', 'Blowfish-based adaptive one-way password hashing'],
        ['Google SDK', 'googleapis', '140.x', 'Official Google client for Gmail API & Calendar API v3'],
        ['Gemini AI SDK', '@google/generative-ai', '0.19.x', 'Official Google Gemini AI model interface'],
        ['Telegram Bot SDK', 'node-telegram-bot-api', '0.66.x', 'Telegram Bot API event listeners and push engine'],
        ['PDF Generator', 'PDFKit', '0.15.x', 'Programmatic PDF generation stream'],
        ['Production DB', 'MySQL2', '3.x', 'High-performance MySQL client library'],
        ['Local DB', 'SQLite3', '5.x', 'Serverless, zero-config file-based SQL database'],
        ['Env Config', 'dotenv', '16.x', 'Loads .env secret keys into process.env'],
        ['Frontend Hosting', 'Vercel', 'Cloud', 'Global Edge CDN static build hosting with rewrites'],
        ['Backend Hosting', 'Render', 'Cloud', 'Containerized Node.js Web Service hosting']
    ]
)

print('Chapters 2 & 3 appended')
