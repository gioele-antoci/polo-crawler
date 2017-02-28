
var request = require("request");
var himalaya = require('himalaya')
var firebase = require('firebase');
var admin = require("firebase-admin");

// Fetch the service account key JSON file contents
const serviceAccount = require("./serviceAccountKey.json");

// Initialize the app with a service account, granting admin privileges
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://polo-64a1f.firebaseio.com"
});

const db = admin.database();
const ref = db.ref("polo/site");

let hrefs = { "https://www.google.ca/": false };

let mustCrawl = true;

async function start() {
    while (mustCrawl) {
        const site = getNextSiteToCrawl();

        //get out, no un-crawled sites
        if (!site) {
            stop();
            return;
        }
        console.log(`crawling ${site}`)
        const dom = await requestHref(site);
        if (dom) {
            const websiteObj = parseDom(site, dom);

            if (!websiteObj) {
                console.log(`${site} was corrupted`);
                continue;
            }

            const portals = websiteObj.hrefObjs;
            websiteObj.isDeadEnd = portals.length === 0;

            //Add to hrefs links, already filtered out
            portals.forEach(site => hrefs[site] = false);
            const newRef = ref.push();
            newRef.set(websiteObj);
        }
        else {
            console.log(`${site} was not crawl-able`);
        }
    }
}

function getNextSiteToCrawl() {
    const site = Object.keys(hrefs).find(key => !hrefs[key]);
    if (site) {
        delete hrefs[site];
        hrefs[extractDomain(site)] = true;

        return site;
    }
    else {
        return null;
    }
}

function extractDomain(url) {
    let domain;
    //find & remove protocol (http, ftp, etc.) and get domain
    if (url.indexOf("://") > -1) {
        domain = url.split('/')[2];
    }
    else {
        domain = url.split('/')[0];
    }

    //find & remove port number
    domain = domain.split(':')[0];

    return domain;
}

function isValid(justCrawledSite, site) {
    const domainHref = extractDomain(site);

    //TODO: explain
    if (domainHref === extractDomain(justCrawledSite) || typeof hrefs[domainHref] !== "undefined" || ((site.indexOf('http://') === -1 && site.indexOf('https://') === -1))) {
        return false;
    }
    else {
        return true;
    }
}

function traverse(html, node) {
    if (html.children) {
        html.children.forEach((d) => {
            //recursion
            node = traverse(d, node)
            //record hrfs and tagname count

            if (d.tagName) {
                //sanitization
                const tag = encodeURIComponent(d.tagName);
                if (!node.elements[tag]) {
                    node.elements[tag] = 1;
                }
                else {
                    node.elements[tag] += 1;
                }

                if (tag === "a" && !!d.attributes.href) {
                    node.hrefObjs.push(d.attributes.href);
                }
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

function parseDom(hrefToParse, dom) {
    let json;
    try {
        json = himalaya.parse(dom);
    }
    catch (e) {
        return null;
    }

    let websiteObj = {
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

    const tempDictionary = {};

    // For each site we crawled if valid add it to a temp dictionary
    // Make sure we dont add 2 sites with same domain. 
    // Only last site with repeated domain will be considered
    websiteObj.hrefObjs.forEach(hrefSite => {
        if (isValid(hrefToParse, hrefSite)) {
            const domain = extractDomain(hrefSite);            
            tempDictionary[domain] = hrefSite;
        }
    });

    websiteObj.hrefObjs = Object.keys(tempDictionary).map(key=> tempDictionary[key]);
    return websiteObj;
}


function getDepth(obj) {
    var depth = 0;
    if (obj.children) {
        obj.children.forEach(function (d) {
            var tmpDepth = getDepth(d)
            if (tmpDepth > depth) {
                depth = tmpDepth
            }
        })
    }
    return 1 + depth
}

function stop() {
    mustCrawl = false;
}

function requestHref(url) {
    return new Promise(function (resolve, reject) {
        request(url, function (error, res, body) {
            if (!error && res.statusCode === 200) {
                resolve(body);
            } else {
                resolve(null);
            }
        });
    });
}

start();
setTimeout(() => stop(), 3 * 60 * 60 * 1000);