const { chromium } = require('playwright');

class AutoFlow {
    constructor(url) {
        this.baseUrl = url;
        this.visited = new Set();
        this.pages = [];
    }

    async discover(maxPages = 30) {
        this.maxPages = maxPages;
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log(`🔍 AutoFlow - Menu Scanner: ${this.baseUrl}\n`);
        
        // Start with the base URL
        await this.visitPage(page, this.baseUrl);
        
        // Scan all menus
        await this.scanAllMenus(page);

        await browser.close();
        
        return {
            baseUrl: this.baseUrl,
            pages: this.pages,
            menuScanned: true
        };
    }

    async visitPage(page, url) {
        if (this.visited.has(url) || this.pages.length >= this.maxPages) return;
        
        this.visited.add(url);
        console.log(`   📄 [${this.pages.length + 1}] Visiting: ${url}`);
        
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
            await page.waitForTimeout(800);
            
            // Extract elements
            const elements = await this.extractElements(page);
            
            const pageData = {
                url: url,
                name: this.guessName(url, await page.title()),
                title: await page.title(),
                elements: elements
            };
            
            this.pages.push(pageData);
            
        } catch (e) {
            console.log(`      ⚠️ ${e.message.split('\n')[0]}`);
        }
    }

    async extractElements(page) {
        const elementCategories = [
            { category: 'buttons', selector: 'button, [role="button"], input[type="submit"], input[type="button"]' },
            { category: 'inputs', selector: 'input[type="text"], input[type="email"], input[type="search"], input[type="password"], textarea' },
            { category: 'links', selector: 'a[href]' },
            { category: 'selects', selector: 'select' },
            { category: 'forms', selector: 'form' },
            { category: 'headings', selector: 'h1, h2, h3, h4, h5, h6' }
        ];

        const elements = [];
        
        for (const { category, selector } of elementCategories) {
            try {
                const els = await page.$$(selector);
                for (const el of els) {
                    const selector = await this.getUniqueSelector(page, el);
                    const text = await el.textContent().catch(() => '');
                    const tag = await el.evaluate(e => e.tagName);
                    
                    if (text && text.trim().length > 0) {
                        elements.push({
                            category,
                            tag: tag.toLowerCase(),
                            selector: selector,
                            text: text.trim().substring(0, 100)
                        });
                    }
                }
            } catch (e) {}
        }
        
        return elements;
    }

    async getUniqueSelector(page, element) {
        try {
            const id = await element.getAttribute('id');
            if (id) return `#${id}`;
            
            const classes = await element.getAttribute('class');
            if (classes) {
                const classList = classes.split(/\s+/).filter(c => c && c.length < 20);
                if (classList.length > 0) {
                    const tag = await element.evaluate(e => e.tagName);
                    return `${tag.toLowerCase()}.${classList[0]}`;
                }
            }
            
            return await element.evaluate((el) => el.tagName.toLowerCase());
        } catch (e) {
            return 'unknown';
        }
    }

    async scanAllMenus(page) {
        console.log(`\n🗺️  Scanning ALL menu dropdowns...\n`);
        
        // Strategy 1: Find all elements that might be menu parents (with dropdowns)
        const menuSelectors = [
            // Standard dropdown patterns
            '[class*="menu"] li:has(a)',
            'nav [class*="menu"] > li',
            '.navbar-nav > li',
            '.nav-item:has(a)',
            '[role="menubar"] > [role="menuitem"]',
            // Generic list-based menus
            'header ul li',
            'nav ul li',
            // Dropdown toggles
            '[class*="dropdown"]:not(.dropdown-menu):not(.dropdown-item)',
            '[data-toggle="dropdown"]',
            // Mega menu items
            '[class*="mega-menu"] > a',
            // Any link that has siblings with links (potential menu)
            'header a:not([href^="http"])',
        ];

        const allMenuItems = new Set();
        
        for (const sel of menuSelectors) {
            try {
                const items = await page.$$(sel);
                for (const item of items) {
                    const text = await item.textContent().catch(() => '');
                    if (text && text.trim().length > 0 && text.trim().length < 30) {
                        allMenuItems.add(text.trim());
                    }
                }
            } catch (e) {}
        }

        console.log(`   Found potential menu items: ${Array.from(allMenuItems).slice(0, 10).join(', ')}`);
        
        // Strategy 2: Hover over each top-level menu item to reveal dropdown
        const topLevelMenuSelectors = [
            'nav > ul > li > a',
            '.navbar > .container > ul > li > a',
            'header nav ul li a',
            '[role="menubar"] > [role="menuitem"]',
            '.nav > .nav-item > a',
            '[class*="header"] a[href]',
            'header a[href]:not([href^="http"])',
            // More generic
            'nav a, .menu a, .nav a, header a'
        ];

        // Get all unique links from the page first
        const allLinks = await page.$$eval('a[href]', links => 
            links.map(l => ({ href: l.href, text: l.textContent?.trim() })).filter(l => l.text && l.href.includes('brave.com'))
        );
        
        console.log(`\n   Total links found on page: ${allLinks.length}`);
        
        // Group links by their likely menu (by URL path)
        const menuGroups = {};
        for (const link of allLinks) {
            try {
                const url = new URL(link.href);
                const path = url.pathname.split('/').filter(p => p)[0];
                if (!menuGroups[path]) menuGroups[path] = [];
                menuGroups[path].push(link);
            } catch (e) {}
        }
        
        console.log(`   Menu groups found: ${Object.keys(menuGroups).length}`);
        
        // Visit pages from each menu group
        let count = 0;
        for (const [path, links] of Object.entries(menuGroups)) {
            if (count >= 15) break; // Limit to avoid too many
            if (path === '' || path === 'www' || path === 'store') continue;
            
            console.log(`\n   📂 Menu: /${path}/ (${links.length} links)`);
            
            // Visit first few links from each menu
            for (const link of links.slice(0, 8)) {
                if (this.pages.length >= this.maxPages) break;
                if (link.href && !link.href.includes('#')) {
                    await this.visitPage(page, link.href);
                    count++;
                }
            }
        }
        
        console.log(`\n✅ Menu scan complete! Visited ${this.pages.length} pages total.`);
    }

    guessName(url, title) {
        const path = new URL(url).pathname;
        if (!path || path === '/') return 'Home';
        
        const parts = path.split('/').filter(p => p);
        if (parts.length > 0) {
            return toTitleCase(parts[parts.length - 1].replace(/[-_]/g, ' ').replace(/\.\w+$/, ''));
        }
        
        return title.substring(0, 30);
    }
}

function toTitleCase(str) {
    return str.replace(/\b\w/g, l => l.toUpperCase());
}

// Usage
const url = process.argv[2] || 'https://example.com';
console.log(`🔍 AutoFlow - Full Menu Scanner\n`);

new AutoFlow(url).discover().then(result => {
    console.log(`\n✅ Discovery complete!`);
    console.log(`   Total pages: ${result.pages.length}`);
    
    // Save results
    require('fs').writeFileSync('workflow.json', JSON.stringify(result, null, 2));
    console.log(`\n💾 Saved to workflow.json`);
}).catch(e => {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
});
