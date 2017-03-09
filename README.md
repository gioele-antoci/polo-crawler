# polo-crawler

This repository serves as initial research for a web-based game called [Polo]().   

## Technology used
- Node v7.0 with harmony flag for async/await use
- Typescript as programming language
- Firebase as schemaless database

## What it is doing
Through 3rd party libraries ( BIG shoot out to [himalaya](https://github.com/andrejewski/himalaya)) and require I am crawling websites and storing some informations about their HTML content. The data is stored in a real-time Google powered database, [Firebase](https://firebase.google.com).   
The data has the following structure: 
```javascript
type siteAnalytics = {
    website: string,
    maxDepth: number,
    elements: { [tag: string]: number },
    hrefObjs: string[],
    childrenCount: { [count: number]: number },
    isDeadEnd: boolean
};
```

`maxDepth` represents the deepest hierarchical level in the DOM for a website.   
 `Elements` is a dictionary with `key` an HTML tag (e.g. `a`, `div`, ...) and value the occorrunces of such tag in the page `website`. Only W3C valid tags are included.     
`childrenCount` is another dictionary. Its key represents the number of children a node has. The value is instead how many nodes have _x_ children (with _x_ being the `key`).   
`hrefObjs` is an array of hrefs found in the page. Those are handy in the game that will be developed.   
`isDeadEnd` is _true_ if no **new** hrefs are found.   

New _hrefs_ are in fact stored in an array (in the application scope). When we crawl a website we look at all the _hrefs_ found and if _subDomain_ + _domain_ has not been found yet, we add it to an array of _hrefs_ yet to crawl. Otherwise, they get dismissed.   
 Until there are new _hrefs_ we keep parsing.