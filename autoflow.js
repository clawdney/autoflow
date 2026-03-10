const { chromium } = require('playwright');

class AutoFlow {
    constructor(url) {
        this.baseUrl = url;
        this.visited = new Set();
        this.pages = [];
        this.maxPages = 50;
    }

    async discover() {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log(`🔍 AutoFlow: ${this.baseUrl}\n`);
        
        // Visit home
        await this.visitPage(page, this.baseUrl);
        
        // Parse menu from DOM
        await this.parseMenuFromDOM(page);

        await browser.close();
        
        return { baseUrl: this.baseUrl, pages: this.pages };
    }

    async visitPage(page, url) {
        if (this.visited.has(url) || this.pages.length >= this.maxPages) return;
        this.visited.add(url);
        
        console.log(`   📄 [${this.pages.length + 1}] ${url}`);
        
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
            await page.waitForTimeout(500);
            
            const elements = await this.extractElements(page);
            this.pages.push({
                url: url,
                name: this.guessName(url),
                title: await page.title(),
                elements: elements
            });
        } catch (e) {
            console.log(`      ⚠️ ${e.message.split('\n')[0]}`);
        }
    }

    async extractElements(page) {
        const categories = [
            { name: 'buttons', sel: 'button, [role="button"], input[type="submit"]' },
            { name: 'inputs', sel: 'input[type="text"], input[type="email"], input[type="search"], input[type="password"]' },
            { name: 'links', sel: 'a[href]' },
            { name: 'headings', sel: 'h1, h2, h3' },
            { name: 'forms', sel: 'form' }
        ];

        const elements = [];
        for (const cat of categories) {
            try {
                const els = await page.$$(cat.sel);
                for (const el of els) {
                    const text = await el.textContent().catch(() => '');
                    const selector = await this.getSelector(el);
                    if (text && text.trim().length > 0) {
                        elements.push({ category: cat.name, text: text.trim().substring(0, 80), selector });
                    }
                }
            } catch (e) {}
        }
        return elements;
    }

    async getSelector(el) {
        try {
            const id = await el.getAttribute('id');
            if (id) return `#${id}`;
            const cls = await el.getAttribute('class');
            if (cls) {
                const c = cls.split(/\s+/)[0];
                if (c) return (await el.evaluate(e => e.tagName)).toLowerCase() + '.' + c;
            }
            return (await el.evaluate(e => e.tagName)).toLowerCase();
        } catch (e) { return 'el'; }
    }

    async parseMenuFromDOM(page) {
        console.log(`\n🗺️  Parsing menu from DOM...\n`);
        
        // Find all navigation menus
        const menuStructure = await page.evaluate(() => {
            const results = { topLevel: [], allMenus: [] };
            
            // Find main navigation
            const navs = document.querySelectorAll('nav, [role="navigation"], header');
            
            navs.forEach(nav => {
                // Get direct child <ul> or <nav> descendant <ul>
                const uls = nav.querySelectorAll(':scope > ul, :scope > div > ul, nav > ul > li');
                
                uls.forEach((ul, ulIdx) => {
                    const lis = ul.querySelectorAll(':scope > li');
                    
                    lis.forEach((li, liIdx) => {
                        // Get the menu item text
                        const link = li.querySelector('a, button, span');
                        const text = link ? link.textContent?.trim() : '';
                        
                        if (text && text.length > 0 && text.length < 40) {
                            // Check for dropdown (submenu)
                            const submenu = li.querySelector('ul, .dropdown-menu, [role="menu"], .menu-dropdown');
                            const subItems = submenu ? Array.from(submenu.querySelectorAll('a')).map(a => ({
                                text: a.textContent?.trim() || '',
                                href: a.href || ''
                            })).filter(i => i.text && i.href) : [];
                            
                            results.topLevel.push({
                                text: text,
                                hasDropdown: !!submenu,
                                subItems: subItems
                            });
                        }
                    });
                });
            });
            
            return results;
        });

        console.log(`   Found ${menuStructure.topLevel.length} top-level menu items\n`);
        
        // Display what was found
        for (let i = 0; i < menuStructure.topLevel.length; i++) {
            const item = menuStructure.topLevel[i];
            console.log(`   ${i + 1}. ${item.text} (${item.hasDropdown ? item.subItems.length + ' sub-items' : 'no dropdown'})`);
            
            // Visit each second-level page
            if (item.subItems && item.subItems.length > 0) {
                for (const subItem of item.subItems.slice(0, 5)) {
                    if (subItem.href && subItem.href.includes(this.baseUrl)) {
                        await this.visitPage(page, subItem.href);
                    }
                }
            }
        }

        console.log(`\n✅ Total: ${this.pages.length} pages`);
    }

    guessName(url) {
        const path = new URL(url).pathname;
        if (!path || path === '/') return 'Home';
        const parts = path.split('/').filter(p => p);
        return parts[parts.length - 1].replace(/[-_]/g, ' ').replace(/\.\w+$/, '').replace(/\b\w/g, l => l.toUpperCase());
    }
}

const url = process.argv[2] || 'https://example.com';
console.log(`🔍 AutoFlow\n`);

new AutoFlow(url).discover().then(result => {
    console.log(`\n✅ Done! ${result.pages.length} pages`);
    require('fs').writeFileSync('workflow.json', JSON.stringify(result, null, 2));
}).catch(e => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
});
