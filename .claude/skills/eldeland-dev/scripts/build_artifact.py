#!/usr/bin/env python3
"""index.html と css/style.css から、Artifact に公開するページ本体を作る。
使い方: python3 .claude/skills/eldeland-dev/scripts/build_artifact.py <出力.html>
公開時は files に js/*.js と vendor/*.js を同じパスで渡す。"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parents[4]
html = (root / 'index.html').read_text()
css = (root / 'css' / 'style.css').read_text()
title = re.search(r'<title>(.*?)</title>', html).group(1)
body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
fonts = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">'
importmap = '<script type="importmap">{ "imports": { "three": "./vendor/three.module.min.js" } }</script>'
if 'importmap' in body: importmap = ''
out = f"<title>{title}</title>\n{fonts}\n<style>\n{css}\n</style>\n{importmap}\n{body.strip()}\n"
pathlib.Path(sys.argv[1]).write_text(out)
files = sorted([str(p.relative_to(root)) for p in list((root/'js').glob('*.js')) + list((root/'vendor').glob('*.js'))])
print('\n'.join(files))
