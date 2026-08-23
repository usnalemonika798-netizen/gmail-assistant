# Appends complete guide content to generate_final_20page_docs.py
import sys

def append_code(code_str):
    with open('generate_final_20page_docs.py', 'a', encoding='utf-8') as f:
        f.write(code_str + '\n')

print('Append helper ready')
