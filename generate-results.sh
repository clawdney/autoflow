#!/bin/bash
URL="${1:-https://example.com}"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

mkdir -p results

# Create basic HTML structure
cat > results/index.html << 'EOF'
<!DOCTYPE html>
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
<p class="timestamp">Last scan: TIMESTAMP</p>
<p><strong>URL:</strong> TARGETURL</p>
<h2>Discovered Pages</h2>
PAGECONTENT
<p><a href="../">← Back to AutoFlow</a></p>
</div>
</body>
</html>
EOF

sed -i "s/TIMESTAMP/$TIMESTAMP/" results/index.html
sed -i "s|TARGETURL|$URL|" results/index.html

# Add content
if [ -f workflow.json ]; then
    python3 << 'PYEOF'
import json
with open('workflow.json') as f:
    d = json.load(f)
pages = d.get('pages', [])
if pages:
    for p in pages:
        els = p.get('elements', [])
        en = ', '.join([e['category'] for e in els]) if els else 'none'
        print(f'<div class="page"><div class="page-name">{p.get("name", "?")}</div><div class="page-url">{p.get("url", "")}</div><div class="elements">Elements: {en}</div></div>')
else:
    print('<p>No pages found</p>')
PYEOF
else
    echo '<p>No data file</p>'
fi > /tmp/pages.html

sed -i 's|PAGECONTENT|'"$(cat /tmp/pages.html)"'|g' results/index.html

echo "Done. Results:"
cat results/index.html
