/**
 * Saved HTML fixtures for the site-audit readiness evals. No live crawling in
 * CI — these are parsed with the same pure `parseHtml` the crawler uses.
 */

/** A well-structured, AEO-ready page: entity + FAQ schema, single H1, FAQ, topics covered. */
export const RICH_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Ada Lovelace — Mathematician &amp; Computing Pioneer</title>
  <meta name="description" content="Ada Lovelace is a mathematician known for her work on analytical engines and the first published algorithm." />
  <link rel="canonical" href="https://adalovelace.example/" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Person","name":"Ada Lovelace","jobTitle":"Mathematician","knowsAbout":["mathematics","analytical engines"]}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Who is Ada Lovelace?","acceptedAnswer":{"@type":"Answer","text":"A 19th-century mathematician."}}]}
  </script>
</head>
<body>
  <h1>Ada Lovelace</h1>
  <p>Ada Lovelace is a mathematician best known for her notes on Charles Babbage's analytical engines, which contain what is considered the first published algorithm.</p>
  <h2>Work on mathematics and analytical engines</h2>
  <p>Across her career in mathematics, Ada Lovelace studied analytical engines in depth and described how such machines could go beyond pure calculation. Her writing on mathematics and analytical engines laid groundwork that later influenced modern computing, and remains widely cited in histories of mathematics and analytical engines alike.</p>
  <h2>Frequently asked questions</h2>
  <h3>Who is Ada Lovelace?</h3>
  <p>A 19th-century mathematician and writer.</p>
  <h3>What did Ada Lovelace contribute to analytical engines?</h3>
  <p>She wrote the first algorithm intended for analytical engines.</p>
  <a href="/about">About Ada</a>
  <a href="/work">Work on analytical engines</a>
</body>
</html>`;

/** A thin, client-rendered shell: no schema, no headings, an empty root + a JS bundle. */
export const THIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>App</title></head>
<body>
  <div id="root"></div>
  <script src="/_next/static/chunks/main-abc123.js"></script>
</body>
</html>`;

/** A typical robots.txt: blocks GPTBot entirely, restricts /private for everyone. */
export const ROBOTS_TXT = `# example robots
User-agent: GPTBot
Disallow: /

User-agent: *
Disallow: /private
Allow: /private/public

Sitemap: https://adalovelace.example/sitemap.xml`;
