const { chromium } = require('playwright');

class AutoFlow {
    constructor(url) {
        this.baseUrl = url;
        this.visited = new Set();
        this.pages = [];
    }

    async discover(maxPages = 50) {
        this.maxPages = maxPages || 50;
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log(`🔍 AutoFlow - Menu Scanner: ${this.baseUrl}\n`);
        
        // Visit home page first
        await this.visitPage(page, this.baseUrl);
        
        // Find and scan ALL top-level menus
        await this.scanTopLevelMenus(page);

        await browser.close();
        
        return {
            baseUrl: this.baseUrl,
            pages: this.pages
        };
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
                name: this.guessName(url, await page.title()),
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
            { name: 'inputs', sel: 'input[type="text"], input[type="email"], input[type="search"]' },
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
                        elements.push({
                            category: cat.name,
                            text: text.trim().substring(0, 80),
                            selector: selector
                        });
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

    async scanTopLevelMenus(page) {
        console.log(`\n🗺️  Finding ALL top-level menu items...\n`);
        
        // First, get ALL unique paths from the site
        const allLinks = await page.$$eval('a[href]', links => 
            links.filter(l => l.href.includes('brave.com') && !l.href.includes('#'))
                 .map(l => ({ href: l.href, text: l.textContent?.trim() || '' }))
        );

        // Extract unique top-level paths (first path segment after domain)
        const pathCounts = {};
        for (const link of allLinks) {
            try {
                const url = new URL(link.href);
                const path = url.pathname.split('/')[1] || '';
                if (path && path.length < 30 && !path.includes('?')) {
                    if (!pathCounts[path]) pathCounts[path] = { count: 0, links: [] };
                    pathCounts[path].count++;
                    pathCounts[path].links.push(link);
                }
            } catch (e) {}
        }

        // Sort by frequency and take top menu paths
        const menuPaths = Object.entries(pathCounts)
            .sort((a, b) => b[1].count - a[1].count)
            .filter(([path]) => path !== '' && !path.includes('.'))
            .slice(0, 8); // Top 8 menu paths

        console.log(`   Found ${menuPaths.length} menu sections:\n`);
        
        // Visit pages from each menu path
        let menuNum = 1;
        for (const [path, data] of menuPaths) {
            if (this.pages.length >= this.maxPages) break;
            
            console.log(`   ${menuNum}. /${path}/ (${data.count} links)`);
            
            // Get unique URLs from this path
            const uniqueUrls = [...new Set(data.links.map(l => l.href))].slice(0, 6);
            
            for (const linkUrl of uniqueUrls) {
                if (this.pages.length >= this.maxPages) break;
                await this.visitPage(page, linkUrl);
            }
            menuNum++;
        }

        console.log(`\n✅ Total pages scanned: ${this.pages.length}`);
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

const url = process.argv[2] || 'https://example.com';
console.log(`🔍 AutoFlow - Full Menu Scanner\n`);

new AutoFlow(url).discover().then(result => {
    console.log(`\n✅ Done! ${result.pages.length} pages`);
    require('fs').writeFileSync('workflow.json', JSON.stringify(result, null, 2));
    console.log(`💾 Saved to workflow.json`);
}).catch(e => {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
});
