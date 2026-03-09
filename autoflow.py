#!/usr/bin/env python3
"""
AutoFlow - Automatic website workflow discovery
"""

import asyncio
import json
from urllib.parse import urljoin, urlparse
from playwright.async_api import async_playwright

class AutoFlow:
    def __init__(self, url):
        self.base_url = url
        self.base_domain = urlparse(url).netloc
        self.visited = set()
        self.pages = []  # Discovered pages
        self.requires_login = False
        self.login_form_found = None
        
    async def discover(self, max_pages=20):
        """Discover all pages starting from main URL"""
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Handle dialogs (alerts, prompts)
            page.on("dialog", lambda dialog: dialog.dismiss())
            
            await self._visit_page(page, self.base_url)
            
            await browser.close()
            
        return {
            "base_url": self.base_url,
            "pages": self.pages,
            "requires_login": self.requires_login,
            "login_form_found": self.login_form_found
        }
    
    async def _visit_page(self, page, url, parent_menu=None):
        """Visit a page and discover its elements"""
        
        if url in self.visited or len(self.visited) >= 20:
            return
            
        self.visited.add(url)
        print(f"  📄 Visiting: {url}")
        
        try:
            # Navigate to page
            response = await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            
            if response and response.status >= 400:
                print(f"     ❌ Error: {response.status}")
                return
                
        except Exception as e:
            print(f"     ❌ Failed: {str(e)[:50]}")
            return
        
        # Get page title
        title = await page.title() or "Untitled"
        
        # Extract elements
        elements = await self._extract_elements(page)
        
        # Check for login form
        login_detected = await self._check_login_form(page)
        if login_detected:
            self.requires_login = True
            self.login_form_found = url
            print(f"     🔐 Login form detected!")
        
        # Find navigation links
        links = await self._find_menu_links(page)
        
        # Store page info
        page_info = {
            "url": url,
            "name": self._guess_name(url, title),
            "title": title,
            "elements": elements,
            "links_found": len(links),
            "is_login_page": login_detected
        }
        self.pages.append(page_info)
        
        # Visit linked pages (limited)
        for link in links[:5]:  # Max 5 links per page
            if link not in self.visited:
                await self._visit_page(page, link)
    
    async def _extract_elements(self, page):
        """Extract meaningful elements from page"""
        
        elements = []
        
        # Common element types to look for
        selectors = {
            "buttons": ["button", "a.button", "input[type=submit]", ".btn"],
            "inputs": ["input", "textarea", "select"],
            "links": ["a"],
            "headings": ["h1", "h2", "h3"],
            "cards": [".card", ".product", ".item", "article"],
            "forms": ["form"],
            "tables": ["table"],
            "images": ["img"]
        }
        
        for category, selector_list in selectors.items():
            for selector in selector_list:
                try:
                    els = await page.query_selector_all(selector)
                    if els:
                        count = len(els)
                        if count > 0:
                            elements.append({
                                "category": category,
                                "selector": selector,
                                "count": count,
                                "examples": await self._get_element_texts(els[:3])
                            })
                        break  # Only first matching selector
                except:
                    pass
        
        return elements
    
    async def _get_element_texts(self, elements):
        """Get text content from elements"""
        texts = []
        for el in elements:
            try:
                text = await el.text_content()
                if text and len(text.strip()) > 0:
                    texts.append(text.strip()[:50])
            except:
                pass
        return texts
    
    async def _check_login_form(self, page):
        """Check if page has login form"""
        
        login_indicators = [
            "password", "login", "signin", "email", 
            "username", "entrar", "acessar", "logar"
        ]
        
        # Check for password input
        password_input = await page.query_selector("input[type=password]")
        if password_input:
            return True
        
        # Check form labels
        html = await page.content().lower()
        for indicator in login_indicators:
            if indicator in html:
                # Check if near a form
                form = await page.query_selector("form")
                if form:
                    return True
        
        return False
    
    async def _find_menu_links(self, page):
        """Find navigation links on page"""
        
        links = []
        
        # Look for navigation elements
        nav_selectors = ["nav", "header", ".menu", ".nav", ".navbar", "[role=navigation]"]
        
        for selector in nav_selectors:
            try:
                nav = await page.query_selector(selector)
                if nav:
                    anchors = await nav.query_selector_all("a")
                    for a in anchors:
                        href = await a.get_attribute("href")
                        if href:
                            full_url = urljoin(self.base_url, href)
                            if urlparse(full_url).netloc == self.base_domain:
                                if full_url not in links:
                                    links.append(full_url)
            except:
                pass
        
        # If no nav found, look for links in main content
        if not links:
            anchors = await page.query_selector_all("main a, .content a, body a")
            for a in anchors[:10]:
                href = await a.get_attribute("href")
                if href and not href.startswith("#"):
                    full_url = urljoin(self.base_url, href)
                    if urlparse(full_url).netloc == self.base_domain:
                        if full_url not in links:
                            links.append(full_url)
        
        return links
    
    def _guess_name(self, url, title):
        """Guess a friendly name for the page"""
        
        path = urlparse(url).path
        if path == "/" or path == "":
            return "Home"
        
        # Get last part of path
        parts = [p for p in path.split("/") if p]
        if parts:
            name = parts[-1]
            # Clean up
            name = name.replace("-", " ").replace("_", " ")
            name = name.title()
            return name
        
        return title[:30] if title else "Page"


async def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python autoflow.py <url>")
        print("Example: python autoflow.py https://example.com")
        sys.exit(1)
    
    url = sys.argv[1]
    print(f"🔍 AutoFlow - Discovering: {url}")
    print("=" * 50)
    
    autoflow = AutoFlow(url)
    result = await autoflow.discover()
    
    print("=" * 50)
    print(f"✅ Discovery complete!")
    print(f"   Pages found: {len(result['pages'])}")
    print(f"   Login required: {result['requires_login']}")
    
    # Save to JSON
    output_file = "workflow.json"
    with open(output_file, "w") as f:
        json.dump(result, f, indent=2)
    print(f"   Saved to: {output_file}")
    
    # Print summary
    print("\n📋 Pages discovered:")
    for i, page in enumerate(result["pages"], 1):
        print(f"   {i}. {page['name']} ({page['url']})")
        print(f"      Elements: {', '.join([e['category'] for e in page['elements']])}")


if __name__ == "__main__":
    asyncio.run(main())
