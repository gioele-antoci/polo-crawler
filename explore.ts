
const request = require("request");
const himalaya = require('himalaya')
const firebase = require('firebase');
const admin = require("firebase-admin");
const parseDomain = require("parse-domain");

// Fetch the service account key JSON file contents
const serviceAccount = require("./serviceAccountKey.json");

// Initialize the app with a service account, granting admin privileges
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://polo-crawler-f920e.firebaseio.com"
});

const db = admin.database();
const ref = db.ref("polo/site");

type siteEntry = {
    [domain: string]: { site: string, crawled: boolean };
};

type siteAnalytics = {
    website: string,
    maxDepth: number,
    elements: { [tag: string]: number },
    hrefObjs: string[],
    childrenCount: { [count: number]: number },
    isDeadEnd: boolean
};


const validTags = {
    "!--...--": true,
    "!DOCTYPE": true,
    "a": true,
    "abbr": true,
    "acronym": true,
    "address": true,
    "applet": true,
    "area": true,
    "article": true,
    "aside": true,
    "audio": true,
    "b": true,
    "base": true,
    "basefont": true,
    "bdi": true,
    "bdo": true,
    "big": true,
    "blockquote": true,
    "body": true,
    "br": true,
    "button": true,
    "canvas": true,
    "caption": true,
    "center": true,
    "cite": true,
    "code": true,
    "col": true,
    "colgroup": true,
    "datalist": true,
    "dd": true,
    "del": true,
    "details": true,
    "dfn": true,
    "dialog": true,
    "dir": true,
    "div": true,
    "dl": true,
    "dt": true,
    "em": true,
    "embed": true,
    "fieldset": true,
    "figcaption": true,
    "figure": true,
    "font": true,
    "footer": true,
    "form": true,
    "frame": true,
    "frameset": true,
    "h1 to &lt;h6&gt;": true,
    "head": true,
    "header": true,
    "hr": true,
    "html": true,
    "i": true,
    "iframe": true,
    "img": true,
    "input": true,
    "ins": true,
    "kbd": true,
    "keygen": true,
    "label": true,
    "legend": true,
    "li": true,
    "link": true,
    "main": true,
    "map": true,
    "mark": true,
    "menu": true,
    "menuitem": true,
    "meta": true,
    "meter": true,
    "nav": true,
    "noframes": true,
    "noscript": true,
    "object": true,
    "ol": true,
    "optgroup": true,
    "option": true,
    "output": true,
    "p": true,
    "param": true,
    "picture": true,
    "pre": true,
    "progress": true,
    "q": true,
    "rp": true,
    "rt": true,
    "ruby": true,
    "s": true,
    "samp": true,
    "script": true,
    "section": true,
    "select": true,
    "small": true,
    "source": true,
    "span": true,
    "strike": true,
    "strong": true,
    "style": true,
    "sub": true,
    "summary": true,
    "sup": true,
    "table": true,
    "tbody": true,
    "td": true,
    "textarea": true,
    "tfoot": true,
    "th": true,
    "thead": true,
    "time": true,
    "title": true,
    "tr": true,
    "track": true,
    "tt": true,
    "u": true,
    "ul": true,
    "var": true,
    "video": true,
    "wbr": true
}
const entrySite = "https://www.google.com";
const hrefs: siteEntry = {};
addHrefToLocalDic(entrySite);

let mustCrawl = true;

async function start() {
    while (mustCrawl) {
        const site = getNextSiteToCrawl();

        //get out, no un-crawled sites
        if (!site) {
            stop();
            return;
        }

        console.time(`crawling ${site}`)
        const dom = await requestHref(site);
        console.timeEnd(`crawling ${site}`)
        if (dom) {
            const websiteObj = parseDom(site, dom);

            if (!websiteObj) {
                console.log(`${site} was corrupted`);
                continue;
            }

            const portals = [];
            //Filter and add to hrefs links
            websiteObj.hrefObjs.forEach(site => {
                site = sanitizeSite(site);
                if (isValid(site)) {
                    addHrefToLocalDic(site);
                    portals.push(site);
                }
            });

            websiteObj.hrefObjs = portals;
            websiteObj.isDeadEnd = portals.length === 0;

            writeToDb(websiteObj);
        }
    }
}

function writeToDb(websiteObj: siteAnalytics) {
    try {
        const newRef = ref.push();
        newRef.set(websiteObj);
    }
    catch (e) {
    }
}

function getNextSiteToCrawl() {
    const domain = Object.keys(hrefs).find(key => !hrefs[key].crawled);
    if (domain) {
        const siteObj = hrefs[domain];
        siteObj.crawled = true;
        return siteObj.site;
    }
    else {
        return null;
    }
}

function sanitizeSite(site: string): string {
    return site.toLowerCase().replace(/\r?\n|\r/g, " ");
}

function addHrefToLocalDic(site: string): void {
    const domain = extractDomain(site);
    hrefs[domain] = { site, crawled: false };
}

function extractDomain(url: string): string {
    const domainObj = parseDomain(url);
    return domainObj ? domainObj.subdomain + domainObj.domain : null;
}

function isValid(site: string) {
    const domainHref = extractDomain(site);
    //we have never met this domain before 
    if (domainHref && typeof hrefs[domainHref] === "undefined") {
        return true;
    }
    else {
        return false;
    }
}

function traverse(html, node) {
    if (html.children) {
        html.children.forEach((d) => {
            //recursion
            node = traverse(d, node)
            //record hrfs and tagname count

            const tag = d.tagName;
            if (tag && validTags[tag])
                //sanitization                
                if (!node.elements[tag]) {
                    node.elements[tag] = 1;
                }
                else {
                    node.elements[tag] += 1;
                }

            if (tag === "a" && !!d.attributes.href) {
                node.hrefObjs.push(d.attributes.href);
            }

            //record how many children does each element have
            // leaves are included as they have children with length 0
            // text leaves are not included has they have no length prop
            if (d.children) {
                if (!node.childrenCount[d.children.length]) {
                    node.childrenCount[d.children.length] = 1;
                }
                else {
                    node.childrenCount[d.children.length] += 1;
                }
            }
        });
    }

    return node;
}

function parseDom(href: string, dom): siteAnalytics {
    let json;
    try {
        json = himalaya.parse(dom);
    }
    catch (e) {
        return null;
    }

    let websiteObj: siteAnalytics = {
        website: href,
        maxDepth: 0,
        elements: {},
        hrefObjs: [],
        childrenCount: {},
        isDeadEnd: false
    };

    const htmlTag = json.filter(x => x.tagName && x.tagName.toLowerCase() === "html")[0];

    if (!htmlTag) {
        console.log("Couldn't find an html tag");
        return null;
    }

    websiteObj = traverse(htmlTag, websiteObj);
    websiteObj.maxDepth = getDepth(htmlTag);
    return websiteObj;
}


function getDepth(obj) {
    let depth = 0;
    if (obj.children) {
        obj.children.forEach(function (d) {
            const tmpDepth = getDepth(d)
            if (tmpDepth > depth) {
                depth = tmpDepth
            }
        })
    }
    return 1 + depth
}

function stop() {
    console.log("stopping...");
    mustCrawl = false;
}

function requestHref(url: string) {
    return new Promise(function (resolve, reject) {
        request(url, function (error, res, body) {
            if (!error && res.statusCode === 200) {
                resolve(body);
            } else {
                console.log(`crawling ${url} threw an error: ${error}`)
                resolve(null);
            }
        });
    });
}

ref.remove().then(() => start());
// setTimeout(() => stop(), 3 * 60 * 60 * 1000);