const { chromium } = require('playwright');

class AutoFlow {
    constructor(url) {
        this.baseUrl = url;
        this.visited = new Set();
        this.pages = [];
        this.requiresLogin = false;
    }
    
    async discover(maxPages = 20) {
        this.maxPages = maxPages;
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Handle dialogs
        page.on('dialog', dialog => dialog.dismiss());
        
        await this.visitPage(page, this.baseUrl);
        
        await browser.close();
        
        return {
            baseUrl: this.baseUrl,
            pages: this.pages,
            requiresLogin: this.requiresLogin
        };
    }
    
    async visitPage(page, url) {
        if (this.visited.has(url) || this.visited.size >= this.maxPages) return;
        this.visited.add(url);
        
        console.log(`  📄 Visiting: ${url}`);
        
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (e) {
            console.log(`     ❌ Failed: ${e.message.substring(0, 50)}`);
            return;
        }
        
        const title = await page.title() || 'Untitled';
        const elements = await this.extractElements(page);
        const isLogin = await this.checkLoginForm(page);
        
        if (isLogin) {
            this.requiresLogin = true;
            console.log(`     🔐 Login form detected!`);
        }
        
        const links = await this.findMenuLinks(page);
        
        this.pages.push({
            url,
            name: this.guessName(url, title),
            title,
            elements,
            linksFound: links.length,
            isLoginPage: isLogin
        });
        
        // Visit linked pages
        for (const link of links.slice(0, 5)) {
            await this.visitPage(page, link);
        }
    }
    
    async extractElements(page) {
        const categories = {
            buttons: ['button', 'a.button', 'input[type=submit]', '.btn'],
            inputs: ['input', 'textarea', 'select'],
            links: ['a'],
            headings: ['h1', 'h2', 'h3'],
            cards: ['.card', '.product', '.item', 'article'],
            forms: ['form'],
            tables: ['table'],
            images: ['img']
        };
        
        const elements = [];
        
        for (const [category, selectors] of Object.entries(categories)) {
            for (const selector of selectors) {
                const els = await page.$$(selector);
                if (els.length > 0) {
                    elements.push({
                        category,
                        selector,
                        count: els.length
                    });
                    break;
                }
            }
        }
        
        return elements;
    }
    
    async checkLoginForm(page) {
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) return true;
        
        const html = (await page.content()).toLowerCase();
        const indicators = ['password', 'login', 'signin', 'entrar', 'acessar'];
        
        if (indicators.some(i => html.includes(i))) {
            const form = await page.$('form');
            return !!form;
        }
        
        return false;
    }
    
    async findMenuLinks(page) {
        const navSelectors = ['nav', 'header', '.menu', '.nav', '.navbar', '[role="navigation"]'];
        let links = [];
        
        for (const selector of navSelectors) {
            const nav = await page.$(selector);
            if (nav) {
                const anchors = await nav.$$('a');
                for (const a of anchors) {
                    const href = await a.getAttribute('href');
                    if (href) links.push(new URL(href, this.baseUrl).href);
                }
                break;
            }
        }
        
        return [...new Set(links)];
    }
    
    guessName(url, title) {
        const path = new URL(url).pathname;
        if (!path || path === '/') return 'Home';
        
        const parts = path.split('/').filter(p => p);
        if (parts.length > 0) {
            return parts[parts.length - 1].replace(/[-_]/g, ' ').replace(/\.\w+$/, '').titleCase();
        }
        
        return title.substring(0, 30);
    }
}

// Usage
const url = process.argv[2] || 'https://example.com';
console.log(`🔍 AutoFlow - Discovering: ${url}\n`);

new AutoFlow(url).discover().then(result => {
    console.log(`\n✅ Discovery complete!`);
    console.log(`   Pages found: ${result.pages.length}`);
    console.log(`   Login required: ${result.requiresLogin}`);
    
    console.log('\n📋 Pages discovered:');
    result.pages.forEach((page, i) => {
        console.log(`   ${i + 1}. ${page.name} (${page.url})`);
    });
    
    // Save to file
    require('fs').writeFileSync('workflow.json', JSON.stringify(result, null, 2));
    console.log('\n💾 Saved to workflow.json');
});
