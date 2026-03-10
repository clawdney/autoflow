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

        // Start with the base URL
        await this.visitPage(page, this.baseUrl);
        
        // Try to find and click menu items
        await this.scanMenus(page);

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
        console.log(`   📄 Visiting: ${url}`);
        
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
            
            // Wait a bit for any dynamic content
            await page.waitForTimeout(1000);
            
            // Extract all relevant elements with their selectors
            const elements = await this.extractElements(page);
            
            // Find menu links on this page
            const menuLinks = await this.findMenuLinks(page);
            
            const pageData = {
                url: url,
                name: this.guessName(url, await page.title()),
                title: await page.title(),
                elements: elements,
                menuLinks: menuLinks,
                selectors: this.buildSelectorMap(elements)
            };
            
            this.pages.push(pageData);
            
            // Visit pages found in menus
            for (const link of menuLinks.slice(0, 10)) { // Limit to avoid too many pages
                if (this.pages.length >= this.maxPages) break;
                await this.visitPage(page, link);
            }
            
        } catch (e) {
            console.log(`      ⚠️ Error: ${e.message.split('\n')[0]}`);
        }
    }

    async extractElements(page) {
        const elementCategories = [
            { category: 'buttons', selector: 'button, [role="button"], input[type="submit"], input[type="button"]' },
            { category: 'inputs', selector: 'input[type="text"], input[type="email"], input[type="search"], input[type="password"], textarea' },
            { category: 'links', selector: 'a[href]' },
            { category: 'selects', selector: 'select' },
            { category: 'forms', selector: 'form' },
            { category: 'headings', selector: 'h1, h2, h3, h4, h5, h6' },
            { category: 'images', selector: 'img' },
            { category: 'lists', selector: 'ul, ol, [role="listbox"]' },
            { category: 'tables', selector: 'table, [role="table"]' },
            { category: 'dialogs', selector: '[role="dialog"], modal, .modal' },
            { category: 'menus', selector: 'nav, [role="navigation"], .menu, .nav, header' }
        ];

        const elements = [];
        
        for (const { category, selector } of elementCategories) {
            try {
                const els = await page.$$(selector);
                for (const el of els) {
                    const selector = await this.getUniqueSelector(page, el);
                    const text = await el.textContent().catch(() => '');
                    const tag = await el.evaluate(e => e.tagName);
                    
                    if (text && text.trim()) {
                        elements.push({
                            category,
                            tag: tag.toLowerCase(),
                            selector: selector,
                            text: text.trim().substring(0, 100),
                            visible: await el.isVisible().catch(() => true)
                        });
                    }
                }
            } catch (e) {
                // Ignore selector errors
            }
        }
        
        return elements;
    }

    async getUniqueSelector(page, element) {
        // Try to get a human-readable selector
        const id = await element.getAttribute('id');
        if (id) return `#${id}`;
        
        const classes = await element.getAttribute('class');
        if (classes) {
            const classList = classes.split(/\s+/).filter(c => c);
            if (classList.length > 0) {
                const tag = await element.evaluate(e => e.tagName);
                return `${tag.toLowerCase()}.${classList[0]}`;
            }
        }
        
        // Fall back to CSS selector
        try {
            return await element.evaluate((el) => {
                if (el.id) return `#${el.id}`;
                if (el.className && typeof el.className === 'string') {
                    return `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`;
                }
                return el.tagName.toLowerCase();
            });
        } catch (e) {
            return 'unknown';
        }
    }

    async findMenuLinks(page) {
        const links = new Set();
        
        try {
            // Find all navigation menus
            const menus = await page.$$('nav, [role="navigation"], .menu, .nav, header, .navbar, .header');
            
            for (const menu of menus) {
                const menuLinks = await menu.$$('a[href]');
                for (const link of menuLinks) {
                    const href = await link.getAttribute('href');
                    const text = await link.textContent();
                    
                    if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
                        const fullUrl = href.startsWith('http') ? href : new URL(href, this.baseUrl).href;
                        if (fullUrl.startsWith(this.baseUrl)) {
                            links.add(fullUrl);
                        }
                    }
                }
            }
            
            // Also try dropdown menus
            const dropdowns = await page.$$('[role="menu"], .dropdown-menu, .menu-dropdown, [class*="dropdown"]');
            for (const dropdown of dropdowns) {
                const ddLinks = await dropdown.$$('a[href]');
                for (const link of ddLinks) {
                    const href = await link.getAttribute('href');
                    if (href && !href.startsWith('#')) {
                        const fullUrl = href.startsWith('http') ? href : new URL(href, this.baseUrl).href;
                        if (fullUrl.startsWith(this.baseUrl)) {
                            links.add(fullUrl);
                        }
                    }
                }
            }
            
        } catch (e) {
            // Ignore errors
        }
        
        return Array.from(links);
    }

    async scanMenus(page) {
        console.log(`\n🗺️  Scanning menus...`);
        
        try {
            // Find all menu items with dropdowns
            const menuItems = await page.$$('[role="menuitem"], .dropdown-toggle, .has-dropdown, [class*="menu-item"]:has(a), li:has(.dropdown)');
            
            for (const item of menuItems) {
                try {
                    // Hover to open dropdown
                    await item.hover();
                    await page.waitForTimeout(500);
                    
                    // Find links in the opened dropdown
                    const dropdownLinks = await item.$$('[role="menuitem"] a, .dropdown-menu a, .submenu a, [class*="dropdown"] a');
                    
                    for (const link of dropdownLinks) {
                        const href = await link.getAttribute('href');
                        const text = await link.textContent();
                        
                        if (href && !href.startsWith('#')) {
                            const fullUrl = href.startsWith('http') ? href : new URL(href, this.baseUrl).href;
                            console.log(`      📂 Menu: ${text?.trim() || 'unknown'} -> ${fullUrl}`);
                            await this.visitPage(page, fullUrl);
                        }
                    }
                } catch (e) {
                    // Ignore individual menu errors
                }
            }
        } catch (e) {
            console.log(`      ⚠️ Menu scan: ${e.message.split('\n')[0]}`);
        }
    }

    buildSelectorMap(elements) {
        const selectors = {};
        for (const el of elements) {
            if (!selectors[el.category]) {
                selectors[el.category] = [];
            }
            selectors[el.category].push({
                selector: el.selector,
                text: el.text
            });
        }
        return selectors;
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
console.log(`🔍 AutoFlow - Menu-Aware Discovery: ${url}\n`);

new AutoFlow(url).discover().then(result => {
    console.log(`\n✅ Discovery complete!`);
    console.log(`   Pages found: ${result.pages.length}`);
    
    // Show summary
    console.log(`\n📋 Summary:`);
    for (const page of result.pages.slice(0, 10)) {
        const categories = page.elements.map(e => e.category).filter((v, i, a) => a.indexOf(v) === i);
        console.log(`   - ${page.name}: ${categories.join(', ')}`);
    }
    
    // Save results
    require('fs').writeFileSync('workflow.json', JSON.stringify(result, null, 2));
    console.log(`\n💾 Saved to workflow.json`);
}).catch(e => {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
});
