#!/bin/bash
# AutoFlow - Quick Start
# Run this on your local machine (Mac/PC)

# Clone or copy this folder, then:

echo "=== AutoFlow Setup ==="

# Install Node.js dependencies (alternative to Python)
npm init -y
npm install playwright puppeteer

# Or use Python (recommended)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run!
echo ""
echo "=== Testing ==="
echo "Try: python autoflow.py https://example.com"
