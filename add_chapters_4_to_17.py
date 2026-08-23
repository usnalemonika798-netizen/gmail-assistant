import os

def append(text):
    with open('build_full_pdf_docx.py', 'a', encoding='utf-8') as target:
        target.write(text + '\n')

print('Chapter builder ready')
