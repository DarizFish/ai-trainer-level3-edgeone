#!/usr/bin/env python3
import os
import re
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
EXTS = ['.ts','.tsx','.js','.jsx','.mjs','.py','.sql','.html','.css']

block_comment_patterns = [
    (re.compile(r'/\*.*?\*/', re.S), 'c_style'),
    (re.compile(r'<!--.*?-->', re.S), 'html'),
    (re.compile(r'("""|\'\'\').*?\1', re.S), 'py_triple'),
]

single_line_tokens = ['//', '#', '--', '<!--']

total_files = 0
ext_counts = defaultdict(int)
ext_files = defaultdict(int)

for dirpath, dirnames, filenames in os.walk(ROOT):
    # skip common build or venv directories
    skip = False
    for p in ['node_modules', '.git', '.next', 'playwright-report', 'dist', 'build', 'venv', '.venv', 'jupyter-lite-build']:
        if p in dirpath:
            skip = True
            break
    if skip:
        continue
    for fn in filenames:
        _, ext = os.path.splitext(fn)
        if ext.lower() not in EXTS:
            continue
        path = os.path.join(dirpath, fn)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                text = f.read()
        except Exception:
            try:
                with open(path, 'r', encoding='latin-1') as f:
                    text = f.read()
            except Exception:
                continue
        # remove block comments heuristically
        for pattern, _ in block_comment_patterns:
            text = pattern.sub('', text)
        lines = text.splitlines()
        eff = 0
        for line in lines:
            s = line.strip()
            if not s:
                continue
            is_comment = False
            for tok in single_line_tokens:
                if s.startswith(tok):
                    is_comment = True
                    break
            if is_comment:
                continue
            eff += 1
        ext_counts[ext.lower()] += eff
        ext_files[ext.lower()] += 1
        total_files += 1

# Print results
print('Effective LOC summary (heuristic):')
print(f'Project root: {ROOT}')
print('')
print(f'Total files scanned: {total_files}')
print('')
print('Per-extension breakdown:')
total_loc = 0
for ext in sorted(ext_counts.keys()):
    loc = ext_counts[ext]
    files = ext_files[ext]
    total_loc += loc
    print(f'  {ext}: {loc} effective lines across {files} files')
print('')
print(f'Total effective lines of code: {total_loc}')
print('\nNote: This is a heuristic count (removes common block comments and single-line comments).')
