#!/bin/bash
URL="${1:-https://example.com}"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

mkdir -p results

# Use Python to generate the full HTML
python3 << 'PYEOF'
import json
import os

url = "$URL"
timestamp = "$TIMESTAMP"

# Read workflow data
pages = []
if os.path.exists('workflow.json'):
    with open('workflow.json') as f:
        data = json.load(f)
        pages = data.get('pages', [])

# Build page content
page_content = ""
if pages:
    for p in pages:
        name = p.get('name', '?')
        page_url = p.get('url', '')
        els = p.get('elements', [])
        en = ', '.join([e['category'] for e in els]) if els else 'none'
        page_content += f'<div class="page"><div class="page-name">{name}</div><div class="page-url">{page_url}</div><div class="elements">Elements: {en}</div></div>\n'
else:
    page_content = '<p>No pages found</p>'

# Use string concatenation to avoid f-string issues with CSS braces
html = '''<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>AutoFlow Results</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:20px;background:#f5f5f5}
.container{background:white;padding:30px;border-radius:12px}
h1{color:#1a1a2e}
.page{background:#f0f0f0;padding:16px;margin:12px 0;border-radius:8px}
.page-name{font-weight:bold}
.page-url{color:#666;word-break:break-all}
.elements{color:#4f46e5;font-size:14px;margin-top:8px}
.timestamp{color:#999;font-size:12px}
a{color:#4f46e5}
</style>
</head>
<body>
<div class="container">
<h1>🤖 AutoFlow Results</h1>
<p class="timestamp">Last scan: ''' + timestamp + '''</p>
<p><strong>URL:</strong> ''' + url + '''</p>
<h2>Discovered Pages</h2>
''' + page_content + '''
<p><a href="../">← Back to AutoFlow</a></p>
</div>
</body>
</html>'''

# Write to files
with open('results/index.html', 'w') as f:
    f.write(html)

with open('index.html', 'w') as f:
    f.write(html)

print("Done.")
PYEOF
