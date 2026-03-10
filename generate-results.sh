#!/bin/bash
URL="${1:-https://example.com}"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

mkdir -p results

# Use Python to generate the full HTML with detailed selectors
python3 << 'PYEOF'
import json
import os
import html

url = "$URL"
timestamp = "$TIMESTAMP"

# Read workflow data
pages = []
if os.path.exists('workflow.json'):
    with open('workflow.json') as f:
        data = json.load(f)
        pages = data.get('pages', [])

# Build page content with selectors
page_content = ""
if pages:
    for p in pages:
        name = html.escape(p.get('name', '?'))
        page_url = html.escape(p.get('url', ''))
        
        # Get elements grouped by category
        elements = p.get('elements', [])
        selectors = p.get('selectors', {})
        
        # Build element details
        element_details = ""
        for category, items in selectors.items():
            if items:
                items_html = ""
                for item in items[:5]:  # Limit to 5 per category
                    sel = html.escape(item.get('selector', ''))
                    txt = html.escape(item.get('text', '')[:50])
                    items_html += f'<span class="selector" title="{sel}">{txt}</span>'
                element_details += f'<div class="category"><span class="cat-label">{category}:</span> {items_html}</div>'
        
        if not element_details:
            element_details = '<span class="none">No elements found</span>'
        
        page_content += f'''<div class="page">
    <div class="page-header">
        <div class="page-name">{name}</div>
        <div class="page-url">{page_url}</div>
    </div>
    <div class="page-elements">
        {element_details}
    </div>
</div>
'''
else:
    page_content = '<p>No pages found</p>'

# HTML with detailed styling
html = '''<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>AutoFlow Results</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:1200px;margin:0 auto;padding:20px;background:#f5f5f5}
.container{background:white;padding:30px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
h1{color:#1a1a2e;margin-bottom:5px}
.timestamp{color:#999;font-size:14px;margin-bottom:20px}
.url{background:#e8f4fd;padding:12px;border-radius:8px;margin-bottom:25px;font-size:16px}
.url strong{color:#0066cc}
.pages-header{font-size:24px;color:#333;margin:30px 0 15px;border-bottom:2px solid #eee;padding-bottom:10px}
.page{background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:20px;overflow:hidden}
.page-header{background:#f8f9fa;padding:15px 20px;border-bottom:1px solid #e0e0e0}
.page-name{font-weight:bold;font-size:18px;color:#1a1a2e}
.page-url{color:#666;font-size:13px;word-break:break-all;margin-top:5px}
.page-elements{padding:15px 20px}
.category{margin-bottom:12px}
.cat-label{font-weight:600;color:#4f46e5;font-size:13px;margin-right:8px}
.selector{display:inline-block;background:#f0f0f5;padding:4px 10px;border-radius:15px;font-size:12px;margin:2px 5px 2px 0;color:#333;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.selector:hover{background:#e0e0e5;cursor:pointer}
.none{color:#999;font-style:italic}
a{color:#4f46e5}
</style>
</head>
<body>
<div class="container">
<h1>🤖 AutoFlow Results</h1>
<p class="timestamp">Last scan: ''' + timestamp + '''</p>
<div class="url"><strong>URL:</strong> ''' + url + '''</div>
<h2 class="pages-header">Discovered Pages (''' + str(len(pages)) + ''')</h2>
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

print("Done. Pages:", len(pages))
PYEOF
