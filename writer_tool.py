import os

def append_to_file(filepath, content):
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write(content + '\n')

print('Writer tool ready')
