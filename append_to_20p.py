import os

def append(text):
    with open('build_20p_docs.py', 'a', encoding='utf-8') as target:
        target.write(text + '\n')

print('Appender ready')
