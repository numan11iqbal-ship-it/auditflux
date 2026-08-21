/**
 * AuditFlux SEO — rules engine.
 *
 * Each rule is an independent object. Adding a check means adding one entry
 * here; nothing else in the extension needs to change.
 *
 * evaluate(d) returns:
 *   status:   'pass' | 'fail' | 'na'   ('na' = not applicable, excluded from scoring)
 *   detected: what the page actually has
 *   expected: what it should have
 *   evidence: array of strings (URLs, snippets) shown under the issue
 */

const SCC_SEVERITY_WEIGHT = { critical: 5, warning: 2, notice: 1 };

/**
 * Category weights for the overall score. Configurable by design — different
 * site types justify different emphasis, and hard-coding a single opinion into
 * a scoring engine is how tools become untrustworthy.
 *
 * Categories that produce no applicable checks are dropped from both the
 * numerator and the denominator, so a page is never penalised for a category
 * that did not apply to it.
 */
const SCC_WEIGHTS = {
  technical: 20,
  onpage: 20,
  content: 15,
  links: 10,
  images: 8,
  schema: 8,
  performance: 8,
  security: 5,
  geo: 6,
  accessibility: 6
};

const SCC_CATEGORIES = [
  { id: 'onpage', label: 'On-page' },
  { id: 'content', label: 'Content' },
  { id: 'links', label: 'Links' },
  { id: 'images', label: 'Images' },
  { id: 'schema', label: 'Schema' },
  { id: 'technical', label: 'Technical' },
  { id: 'performance', label: 'Performance' },
  { id: 'security', label: 'Security' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'geo', label: 'GEO / AEO' }
];

const SCC_RULES = [
  /* ------------------------------- ON-PAGE ------------------------------- */
  {
    id: 'TITLE_MISSING', category: 'onpage', severity: 'critical',
    title: 'Title tag is missing',
    why: 'The title is the strongest on-page signal for what a page is about, and it is what searchers click in the results.',
    how: 'Add a unique <title> in the <head> describing the page in 30–60 characters.',
    evaluate: (d) => ({
      status: d.head.title ? 'pass' : 'fail',
      detected: d.head.title || 'No title tag',
      expected: 'A unique title, 30–60 characters'
    })
  },
  {
    id: 'TITLE_TOO_SHORT', category: 'onpage', severity: 'warning',
    title: 'Title is shorter than 30 characters',
    why: 'Very short titles waste space in the result and usually leave out useful qualifying words.',
    how: 'Expand the title with the specific topic and, where it fits naturally, the brand.',
    evaluate: (d) => {
      if (!d.head.title) return { status: 'na' };
      return {
        status: d.head.titleLength >= 30 ? 'pass' : 'fail',
        detected: d.head.titleLength + ' characters',
        expected: '30–60 characters',
        evidence: [d.head.title]
      };
    }
  },
  {
    id: 'TITLE_TOO_LONG', category: 'onpage', severity: 'warning',
    title: 'Title is longer than 60 characters',
    why: 'Long titles get truncated in search results, so the end of the title may never be seen.',
    how: 'Move the most important words to the front and trim to roughly 60 characters.',
    evaluate: (d) => {
      if (!d.head.title) return { status: 'na' };
      return {
        status: d.head.titleLength <= 60 ? 'pass' : 'fail',
        detected: d.head.titleLength + ' characters',
        expected: '60 characters or fewer',
        evidence: [d.head.title]
      };
    }
  },
  {
    id: 'TITLE_DUPLICATE_TAG', category: 'onpage', severity: 'warning',
    title: 'More than one title tag',
    why: 'Multiple titles are ambiguous and search engines will pick one for you.',
    how: 'Keep exactly one <title> element in the <head>.',
    evaluate: (d) => ({
      status: d.head.titleCount <= 1 ? 'pass' : 'fail',
      detected: d.head.titleCount + ' title tags',
      expected: 'Exactly 1'
    })
  },
  {
    id: 'META_DESCRIPTION_MISSING', category: 'onpage', severity: 'critical',
    title: 'Meta description is missing',
    why: 'Without one, search engines generate a snippet from page text, which is rarely the pitch you would choose.',
    how: 'Add a meta description of 70–160 characters that summarises the page and gives a reason to click.',
    evaluate: (d) => ({
      status: d.head.metaDescription ? 'pass' : 'fail',
      detected: d.head.metaDescription || 'No meta description',
      expected: 'A unique description, 70–160 characters'
    })
  },
  {
    id: 'META_DESCRIPTION_TOO_LONG', category: 'onpage', severity: 'warning',
    title: 'Meta description is longer than 160 characters',
    why: 'Overly long descriptions are cut off mid-sentence in the results.',
    how: 'Tighten to roughly 160 characters, leading with the benefit.',
    evaluate: (d) => {
      if (!d.head.metaDescription) return { status: 'na' };
      return {
        status: d.head.metaDescriptionLength <= 160 ? 'pass' : 'fail',
        detected: d.head.metaDescriptionLength + ' characters',
        expected: '160 characters or fewer',
        evidence: [d.head.metaDescription]
      };
    }
  },
  {
    id: 'META_DESCRIPTION_TOO_SHORT', category: 'onpage', severity: 'notice',
    title: 'Meta description is shorter than 70 characters',
    why: 'Short descriptions leave available snippet space unused.',
    how: 'Add detail about what the page covers and who it is for.',
    evaluate: (d) => {
      if (!d.head.metaDescription) return { status: 'na' };
      return {
        status: d.head.metaDescriptionLength >= 70 ? 'pass' : 'fail',
        detected: d.head.metaDescriptionLength + ' characters',
        expected: '70–160 characters'
      };
    }
  },
  {
    id: 'H1_MISSING', category: 'onpage', severity: 'critical',
    title: 'H1 heading is missing',
    why: 'The H1 states the page topic to both readers and crawlers, and anchors the heading hierarchy.',
    how: 'Add one H1 that matches the page intent, close to the title.',
    evaluate: (d) => ({
      status: d.headingStats.h1 > 0 ? 'pass' : 'fail',
      detected: d.headingStats.h1 + ' H1 headings',
      expected: 'Exactly 1'
    })
  },
  {
    id: 'MULTIPLE_H1', category: 'onpage', severity: 'warning',
    title: 'More than one H1 on the page',
    why: 'Several H1s blur the page topic and usually signal that headings are being used for styling.',
    how: 'Keep one H1 and demote the rest to H2.',
    evaluate: (d) => {
      if (d.headingStats.h1 === 0) return { status: 'na' };
      return {
        status: d.headingStats.h1 === 1 ? 'pass' : 'fail',
        detected: d.headingStats.h1 + ' H1 headings',
        expected: 'Exactly 1',
        evidence: d.headingStats.h1Texts.slice(0, 6)
      };
    }
  },
  {
    id: 'HEADING_HIERARCHY', category: 'onpage', severity: 'notice',
    title: 'Heading levels are skipped',
    why: 'Jumping from H2 straight to H4 breaks the document outline that assistive tech and parsers rely on.',
    how: 'Step down one level at a time.',
    evaluate: (d) => ({
      status: d.headingStats.skips.length === 0 ? 'pass' : 'fail',
      detected: d.headingStats.skips.length + ' skipped levels',
      expected: 'No skipped levels',
      evidence: d.headingStats.skips.slice(0, 6).map(s => 'H' + s.from + ' → H' + s.to + ': ' + s.text)
    })
  },
  {
    id: 'HEADING_EMPTY', category: 'onpage', severity: 'notice',
    title: 'Empty headings found',
    why: 'Empty heading tags add nothing to the outline and are usually leftover markup.',
    how: 'Remove the empty tags or give them real text.',
    evaluate: (d) => ({
      status: d.headingStats.empty === 0 ? 'pass' : 'fail',
      detected: d.headingStats.empty + ' empty headings',
      expected: '0'
    })
  },
  {
    id: 'CANONICAL_MISSING', category: 'onpage', severity: 'warning',
    title: 'Canonical tag is missing',
    why: 'A canonical tells search engines which URL is the preferred version when duplicates exist.',
    how: 'Add a self-referencing canonical link unless this page is intentionally canonicalised elsewhere.',
    evaluate: (d) => ({
      status: d.head.canonical ? 'pass' : 'fail',
      detected: d.head.canonical || 'No canonical tag',
      expected: 'A canonical link element'
    })
  },
  {
    id: 'CANONICAL_MULTIPLE', category: 'onpage', severity: 'warning',
    title: 'More than one canonical tag',
    why: 'Conflicting canonicals are typically ignored, leaving the page to be consolidated unpredictably.',
    how: 'Keep exactly one canonical link.',
    evaluate: (d) => {
      if (d.head.canonicalCount === 0) return { status: 'na' };
      return {
        status: d.head.canonicalCount === 1 ? 'pass' : 'fail',
        detected: d.head.canonicalCount + ' canonical tags',
        expected: 'Exactly 1'
      };
    }
  },
  {
    id: 'CANONICAL_NOT_SELF', category: 'onpage', severity: 'notice',
    title: 'Canonical points to a different URL',
    why: 'This is correct for deliberate duplicates, and a problem when unintended, because the page asks not to be indexed in its own right.',
    how: 'Confirm this is intentional. If it is not, point the canonical at this URL.',
    evaluate: (d) => {
      if (!d.head.canonical) return { status: 'na' };
      return {
        status: d.head.canonicalIsSelf ? 'pass' : 'fail',
        detected: d.head.canonical,
        expected: d.page.url,
        evidence: ['Review whether this page should be consolidated into the canonical target.']
      };
    }
  },
  {
    id: 'ROBOTS_NOINDEX', category: 'onpage', severity: 'critical',
    title: 'Page is set to noindex',
    why: 'A noindex directive removes the page from search results entirely.',
    how: 'If this page should rank, remove noindex from the robots meta tag.',
    evaluate: (d) => ({
      status: d.head.noindex ? 'fail' : 'pass',
      detected: d.head.robotsMeta || d.head.googlebotMeta || 'No robots meta directive',
      expected: 'index (or no robots meta tag)'
    })
  },
  {
    id: 'ROBOTS_NOFOLLOW', category: 'onpage', severity: 'warning',
    title: 'Page is set to nofollow',
    why: 'Nofollow stops link discovery and equity flow from this page to the rest of the site.',
    how: 'Remove nofollow unless you deliberately want links here ignored.',
    evaluate: (d) => ({
      status: d.head.nofollow ? 'fail' : 'pass',
      detected: d.head.robotsMeta || 'No robots meta directive',
      expected: 'follow (or no robots meta tag)'
    })
  },
  {
    id: 'VIEWPORT_MISSING', category: 'onpage', severity: 'critical',
    title: 'Viewport meta tag is missing',
    why: 'Without it the page renders at desktop width on phones, which fails mobile usability.',
    how: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    evaluate: (d) => ({
      status: d.head.viewport ? 'pass' : 'fail',
      detected: d.head.viewport || 'No viewport tag',
      expected: 'width=device-width, initial-scale=1'
    })
  },
  {
    id: 'LANG_MISSING', category: 'onpage', severity: 'notice',
    title: 'HTML lang attribute is missing',
    why: 'The lang attribute tells search engines and screen readers which language the page is in.',
    how: 'Set lang on the <html> element, for example lang="en".',
    evaluate: (d) => ({
      status: d.page.lang ? 'pass' : 'fail',
      detected: d.page.lang || 'Not set',
      expected: 'A valid language code'
    })
  },
  {
    id: 'OG_TAGS_MISSING', category: 'onpage', severity: 'warning',
    title: 'Open Graph tags are incomplete',
    why: 'Without them, shared links on social platforms and chat apps render without a title, description or image.',
    how: 'Add og:title, og:description and og:image.',
    evaluate: (d) => {
      const missing = [];
      if (!d.social.ogTitle) missing.push('og:title');
      if (!d.social.ogDescription) missing.push('og:description');
      if (!d.social.ogImage) missing.push('og:image');
      return {
        status: missing.length === 0 ? 'pass' : 'fail',
        detected: missing.length ? 'Missing: ' + missing.join(', ') : 'All present',
        expected: 'og:title, og:description, og:image'
      };
    }
  },
  {
    id: 'TWITTER_CARD_MISSING', category: 'onpage', severity: 'notice',
    title: 'Twitter card tag is missing',
    why: 'Controls how the page previews on X and several other clients that read the same tags.',
    how: 'Add <meta name="twitter:card" content="summary_large_image">.',
    evaluate: (d) => ({
      status: d.social.twitterCard ? 'pass' : 'fail',
      detected: d.social.twitterCard || 'Not set',
      expected: 'summary or summary_large_image'
    })
  },

  /* ------------------------------- CONTENT ------------------------------- */
  {
    id: 'THIN_CONTENT', category: 'content', severity: 'warning',
    title: 'Page has thin content',
    why: 'Pages under roughly 300 words often lack the depth to answer a query fully or to earn links.',
    how: 'Expand with specifics, examples and answers to the questions this page should resolve.',
    evaluate: (d) => ({
      status: d.content.wordCount >= 300 ? 'pass' : 'fail',
      detected: d.content.wordCount + ' words',
      expected: '300+ words',
      evidence: ['Counted inside <' + d.content.contentRoot + '>, excluding nav, header, footer and scripts.']
    })
  },
  {
    id: 'CONTENT_NO_SUBHEADINGS', category: 'content', severity: 'notice',
    title: 'Long content has no subheadings',
    why: 'Unbroken text is hard to scan and gives extraction engines nothing to anchor a passage to.',
    how: 'Break the content into H2 sections with descriptive headings.',
    evaluate: (d) => {
      if (d.content.wordCount < 600) return { status: 'na' };
      return {
        status: d.headingStats.h2 > 0 ? 'pass' : 'fail',
        detected: d.headingStats.h2 + ' H2 headings for ' + d.content.wordCount + ' words',
        expected: 'At least one H2 per major section'
      };
    }
  },
  {
    id: 'DUPLICATE_HEADINGS', category: 'content', severity: 'notice',
    title: 'Duplicate heading text',
    why: 'Repeated headings make the outline ambiguous and often indicate repeated boilerplate sections.',
    how: 'Make each heading describe its own section.',
    evaluate: (d) => ({
      status: d.headingStats.duplicates.length === 0 ? 'pass' : 'fail',
      detected: d.headingStats.duplicates.length + ' repeated headings',
      expected: 'Unique headings',
      evidence: d.headingStats.duplicates.slice(0, 6).map(x => '"' + x.text + '" ×' + x.count)
    })
  },
  {
    id: 'CONTENT_NO_PARAGRAPHS', category: 'content', severity: 'notice',
    title: 'Very few paragraphs detected',
    why: 'Content built without paragraph elements is harder to parse and to read.',
    how: 'Use real <p> elements for body copy rather than line breaks or styled divs.',
    evaluate: (d) => {
      if (d.content.wordCount < 200) return { status: 'na' };
      return {
        status: d.content.paragraphs >= 3 ? 'pass' : 'fail',
        detected: d.content.paragraphs + ' paragraphs',
        expected: '3 or more'
      };
    }
  },

  /* -------------------------------- LINKS -------------------------------- */
  {
    id: 'NO_INTERNAL_LINKS', category: 'links', severity: 'warning',
    title: 'Page has no internal links',
    why: 'Internal links pass authority and give crawlers a path to the rest of the site.',
    how: 'Link to related pages using descriptive anchor text.',
    evaluate: (d) => ({
      status: d.linkStats.internal > 0 ? 'pass' : 'fail',
      detected: d.linkStats.internal + ' internal links',
      expected: 'At least a few relevant internal links'
    })
  },
  {
    id: 'GENERIC_ANCHORS', category: 'links', severity: 'warning',
    title: 'Generic anchor text in use',
    why: 'Anchors like "click here" describe nothing about the destination, for readers or for search engines.',
    how: 'Replace with anchor text that names the target topic.',
    evaluate: (d) => ({
      status: d.linkStats.generic === 0 ? 'pass' : 'fail',
      detected: d.linkStats.generic + ' generic anchors',
      expected: '0',
      evidence: d.linkStats.genericSamples.map(s => '"' + s.anchor + '" → ' + s.href)
    })
  },
  {
    id: 'EMPTY_ANCHORS', category: 'links', severity: 'warning',
    title: 'Links with no anchor text',
    why: 'A link with no text and no image gives no context to anyone, and is unusable with a screen reader.',
    how: 'Add visible text, or an aria-label where the link is an icon.',
    evaluate: (d) => ({
      status: d.linkStats.emptyAnchors === 0 ? 'pass' : 'fail',
      detected: d.linkStats.emptyAnchors + ' empty anchors',
      expected: '0',
      evidence: d.linkStats.emptyAnchorSamples.map(s => s.href)
    })
  },
  {
    id: 'EXCESSIVE_LINKS', category: 'links', severity: 'notice',
    title: 'Very high number of links on the page',
    why: 'Hundreds of links dilute the value each one passes and make the important ones harder to find.',
    how: 'Trim navigation and footer link blocks where you can.',
    evaluate: (d) => ({
      status: d.linkStats.total <= 300 ? 'pass' : 'fail',
      detected: d.linkStats.total + ' links',
      expected: '300 or fewer'
    })
  },
  {
    id: 'TARGET_BLANK_NO_NOOPENER', category: 'links', severity: 'notice',
    title: 'target="_blank" links without rel="noopener"',
    why: 'The opened page gets a reference back to yours, which is a small security and performance risk.',
    how: 'Add rel="noopener" to links that open in a new tab.',
    evaluate: (d) => ({
      status: d.linkStats.targetBlankNoRel === 0 ? 'pass' : 'fail',
      detected: d.linkStats.targetBlankNoRel + ' links',
      expected: '0'
    })
  },

  /* -------------------------------- IMAGES ------------------------------- */
  {
    id: 'IMG_ALT_MISSING', category: 'images', severity: 'critical',
    title: 'Images are missing alt attributes',
    why: 'Alt text is how screen readers describe an image and how search engines understand it.',
    how: 'Describe the image in a few words. Use alt="" only for purely decorative images.',
    evaluate: (d) => {
      if (d.imageStats.total === 0) return { status: 'na' };
      return {
        status: d.imageStats.altMissing === 0 ? 'pass' : 'fail',
        detected: d.imageStats.altMissing + ' of ' + d.imageStats.total + ' images have no alt attribute',
        expected: 'Every meaningful image has alt text',
        evidence: d.images.filter(i => i.altMissing).slice(0, 10).map(i => i.src)
      };
    }
  },
  {
    id: 'IMG_ALT_TOO_LONG', category: 'images', severity: 'notice',
    title: 'Alt text longer than 125 characters',
    why: 'Long alt text is cut off by many screen readers and usually belongs in a caption instead.',
    how: 'Keep alt text concise and move detail into the surrounding copy.',
    evaluate: (d) => {
      if (d.imageStats.total === 0) return { status: 'na' };
      return {
        status: d.imageStats.altTooLong === 0 ? 'pass' : 'fail',
        detected: d.imageStats.altTooLong + ' images',
        expected: '125 characters or fewer'
      };
    }
  },
  {
    id: 'IMG_BROKEN', category: 'images', severity: 'critical',
    title: 'Broken images',
    why: 'The image failed to load, so visitors see nothing where content should be.',
    how: 'Fix or remove the source URL.',
    evaluate: (d) => {
      if (d.imageStats.total === 0) return { status: 'na' };
      return {
        status: d.imageStats.broken === 0 ? 'pass' : 'fail',
        detected: d.imageStats.broken + ' broken images',
        expected: '0',
        evidence: d.images.filter(i => i.broken).slice(0, 10).map(i => i.src)
      };
    }
  },
  {
    id: 'IMG_NO_DIMENSIONS', category: 'images', severity: 'notice',
    title: 'Images without width and height attributes',
    why: 'Explicit dimensions let the browser reserve space, which prevents layout shift as images load.',
    how: 'Set width and height attributes on img elements.',
    evaluate: (d) => {
      if (d.imageStats.total === 0) return { status: 'na' };
      return {
        status: d.imageStats.missingDimensions === 0 ? 'pass' : 'fail',
        detected: d.imageStats.missingDimensions + ' of ' + d.imageStats.total + ' images',
        expected: 'All images have width and height'
      };
    }
  },
  {
    id: 'IMG_OVERSIZED', category: 'images', severity: 'notice',
    title: 'Images served much larger than displayed',
    why: 'Downloading pixels the visitor never sees slows the page, especially on mobile connections.',
    how: 'Serve appropriately sized images, and use srcset for responsive variants.',
    evaluate: (d) => {
      if (d.imageStats.total === 0) return { status: 'na' };
      return {
        status: d.imageStats.oversized === 0 ? 'pass' : 'fail',
        detected: d.imageStats.oversized + ' images at more than twice their display width',
        expected: '0',
        evidence: d.images.filter(i => i.naturalWidth > 0 && i.displayWidth > 0 && i.naturalWidth > i.displayWidth * 2)
          .slice(0, 8).map(i => i.naturalWidth + 'px served, ' + i.displayWidth + 'px shown — ' + i.src)
      };
    }
  },

  /* -------------------------------- SCHEMA ------------------------------- */
  {
    id: 'SCHEMA_MISSING', category: 'schema', severity: 'warning',
    title: 'No structured data found',
    why: 'Structured data is how search and AI systems read entities, and it is a prerequisite for rich results.',
    how: 'Add JSON-LD for the page type, starting with Organization and WebSite.',
    evaluate: (d) => ({
      status: (d.schema.jsonLdBlocks > 0 || d.schema.microdataTypes.length > 0) ? 'pass' : 'fail',
      detected: d.schema.jsonLdBlocks + ' JSON-LD blocks, ' + d.schema.microdataTypes.length + ' microdata types',
      expected: 'At least one structured data block'
    })
  },
  {
    id: 'SCHEMA_INVALID_JSON', category: 'schema', severity: 'critical',
    title: 'Structured data contains invalid JSON',
    why: 'A block that fails to parse is discarded entirely, so none of its markup counts.',
    how: 'Fix the JSON syntax error reported below.',
    evaluate: (d) => {
      if (d.schema.jsonLdBlocks === 0) return { status: 'na' };
      return {
        status: d.schema.invalidBlocks === 0 ? 'pass' : 'fail',
        detected: d.schema.invalidBlocks + ' invalid blocks',
        expected: '0',
        evidence: d.schema.blocks.filter(b => !b.valid).map(b => 'Block ' + (b.index + 1) + ': ' + b.error)
      };
    }
  },
  {
    id: 'SCHEMA_MISSING_CONTEXT', category: 'schema', severity: 'warning',
    title: 'Structured data missing @context',
    why: 'Without @context the vocabulary is undefined and parsers cannot interpret the types.',
    how: 'Add "@context": "https://schema.org" to each block.',
    evaluate: (d) => {
      if (d.schema.jsonLdBlocks === 0) return { status: 'na' };
      return {
        status: d.schema.missingContext === 0 ? 'pass' : 'fail',
        detected: d.schema.missingContext + ' blocks without @context',
        expected: '0'
      };
    }
  },
  {
    id: 'SCHEMA_MISSING_TYPE', category: 'schema', severity: 'warning',
    title: 'Structured data missing @type',
    why: 'A block with no @type declares nothing about what the entity is.',
    how: 'Add an @type to each entity.',
    evaluate: (d) => {
      if (d.schema.jsonLdBlocks === 0) return { status: 'na' };
      return {
        status: d.schema.missingType === 0 ? 'pass' : 'fail',
        detected: d.schema.missingType + ' blocks without @type',
        expected: '0'
      };
    }
  },
  {
    id: 'SCHEMA_NO_ORGANIZATION', category: 'schema', severity: 'notice',
    title: 'No Organization or Person entity',
    why: 'This is the entity that identifies who publishes the site, and it underpins brand recognition in AI answers.',
    how: 'Add Organization (or Person for a personal site) with name, url, logo and sameAs.',
    evaluate: (d) => {
      const has = d.schema.types.some(t => ['Organization', 'Person', 'LocalBusiness', 'Corporation'].indexOf(t) !== -1);
      return {
        status: has ? 'pass' : 'fail',
        detected: d.schema.types.length ? d.schema.types.join(', ') : 'No types detected',
        expected: 'Organization, LocalBusiness or Person'
      };
    }
  },
  {
    id: 'SCHEMA_NO_BREADCRUMB', category: 'schema', severity: 'notice',
    title: 'No BreadcrumbList markup',
    why: 'Breadcrumb markup clarifies site hierarchy and can replace the raw URL in search results.',
    how: 'Add BreadcrumbList reflecting the path to this page.',
    evaluate: (d) => ({
      status: d.schema.types.indexOf('BreadcrumbList') !== -1 ? 'pass' : 'fail',
      detected: d.schema.types.indexOf('BreadcrumbList') !== -1 ? 'Present' : 'Not found',
      expected: 'BreadcrumbList'
    })
  },

  /* ------------------------------ TECHNICAL ------------------------------ */
  {
    id: 'NOT_HTTPS', category: 'security', severity: 'critical',
    title: 'Page is not served over HTTPS',
    why: 'HTTPS is a baseline expectation, a light ranking signal, and browsers warn on pages without it.',
    how: 'Install a TLS certificate and redirect all HTTP traffic to HTTPS.',
    evaluate: (d) => ({
      status: d.page.isHttps ? 'pass' : 'fail',
      detected: d.page.protocol,
      expected: 'https:'
    })
  },
  {
    id: 'MIXED_CONTENT', category: 'security', severity: 'critical',
    title: 'Mixed content on an HTTPS page',
    why: 'Insecure sub-resources on a secure page get blocked or downgrade the padlock.',
    how: 'Update these resource URLs to https.',
    evaluate: (d) => {
      if (!d.page.isHttps) return { status: 'na' };
      return {
        status: d.tech.mixedContentCount === 0 ? 'pass' : 'fail',
        detected: d.tech.mixedContentCount + ' insecure resources',
        expected: '0',
        evidence: d.tech.mixedContent.slice(0, 10)
      };
    }
  },
  {
    id: 'SLOW_TTFB', category: 'performance', severity: 'warning',
    title: 'Slow server response time',
    why: 'Time to first byte gates every other loading metric, including Largest Contentful Paint.',
    how: 'Look at server processing, database queries and caching. A CDN usually helps most.',
    evaluate: (d) => {
      if (d.page.ttfbMs === null) return { status: 'na' };
      return {
        status: d.page.ttfbMs <= 800 ? 'pass' : 'fail',
        detected: d.page.ttfbMs + ' ms',
        expected: '800 ms or less',
        evidence: ['Measured on this page load from the Navigation Timing API, not a lab test.']
      };
    }
  },
  {
    id: 'ROBOTS_TXT_MISSING', category: 'technical', severity: 'warning',
    title: 'robots.txt not found',
    why: 'Without robots.txt you cannot state crawl rules or point crawlers to your sitemaps.',
    how: 'Add a robots.txt at the domain root with a Sitemap directive.',
    evaluate: (d) => {
      if (d.robots.status === null) return { status: 'na' };
      return {
        status: (d.robots.fetched && !d.robots.isHtml) ? 'pass' : 'fail',
        detected: d.robots.isHtml ? 'Returned an HTML page instead of a text file' : 'HTTP ' + d.robots.status,
        expected: 'HTTP 200 with plain text'
      };
    }
  },
  {
    id: 'ROBOTS_BLOCKED', category: 'technical', severity: 'critical',
    title: 'This URL is blocked by robots.txt',
    why: 'A blocked URL cannot be crawled, so its content will not be indexed.',
    how: 'Remove or narrow the Disallow rule that matches this path.',
    evaluate: (d) => {
      if (d.robots.pageAllowed === null) return { status: 'na' };
      const bot = d.robots.bots.find(b => b.name === 'Googlebot');
      return {
        status: d.robots.pageAllowed ? 'pass' : 'fail',
        detected: bot && bot.rule ? 'Matched ' + bot.rule : 'No matching rule',
        expected: 'Allowed for Googlebot'
      };
    }
  },
  {
    id: 'SITEMAP_MISSING', category: 'technical', severity: 'warning',
    title: 'No reachable XML sitemap',
    why: 'A sitemap helps search engines discover URLs, especially ones that are poorly linked internally.',
    how: 'Publish an XML sitemap and declare it in robots.txt.',
    evaluate: (d) => {
      const ok = d.sitemaps.filter(s => s.ok && s.valid);
      return {
        status: ok.length > 0 ? 'pass' : 'fail',
        detected: ok.length ? ok.map(s => s.url + ' (' + s.urlCount + ' URLs)').join(', ') : 'None found',
        expected: 'At least one valid XML sitemap',
        evidence: d.sitemaps.map(s => s.url + ' — ' + (s.error ? 'unreachable' : 'HTTP ' + s.status + (s.ok && !s.valid ? ', not valid XML' : '')))
      };
    }
  },
  {
    id: 'SITEMAP_NOT_IN_ROBOTS', category: 'technical', severity: 'notice',
    title: 'Sitemap not declared in robots.txt',
    why: 'A Sitemap directive is the standard way for any crawler to find your sitemap without guessing.',
    how: 'Add a "Sitemap: https://…/sitemap.xml" line to robots.txt.',
    evaluate: (d) => {
      if (!d.robots.fetched) return { status: 'na' };
      return {
        status: d.robots.sitemaps.length > 0 ? 'pass' : 'fail',
        detected: d.robots.sitemaps.length + ' sitemap directives',
        expected: 'At least 1'
      };
    }
  },
  {
    id: 'HSTS_MISSING', category: 'security', severity: 'warning',
    title: 'HSTS header is not set',
    why: 'Strict-Transport-Security tells browsers to only ever connect over HTTPS, closing the gap where a first plain-HTTP request can be intercepted.',
    how: 'Send Strict-Transport-Security: max-age=31536000; includeSubDomains once you are confident every subdomain supports HTTPS.',
    evaluate: (d) => {
      if (!d.security.available || !d.page.isHttps) return { status: 'na' };
      return {
        status: d.security.hsts.present ? 'pass' : 'fail',
        detected: d.security.hsts.value || 'Header not sent',
        expected: 'max-age of at least one year'
      };
    }
  },
  {
    id: 'CSP_MISSING', category: 'security', severity: 'notice',
    title: 'No Content-Security-Policy header',
    why: 'CSP limits which scripts and resources can run, which is the main defence against cross-site scripting and injected third-party code.',
    how: 'Add a Content-Security-Policy header. Start in report-only mode to find breakages before enforcing.',
    evaluate: (d) => {
      if (!d.security.available) return { status: 'na' };
      return {
        status: d.security.csp.present ? 'pass' : 'fail',
        detected: d.security.csp.value ? d.security.csp.value.slice(0, 200) : 'Header not sent',
        expected: 'A Content-Security-Policy header'
      };
    }
  },
  {
    id: 'CONTENT_TYPE_OPTIONS_MISSING', category: 'security', severity: 'notice',
    title: 'X-Content-Type-Options is not set',
    why: 'Without nosniff, browsers may guess a file type and execute something that was never meant to run as script.',
    how: 'Send X-Content-Type-Options: nosniff.',
    evaluate: (d) => {
      if (!d.security.available) return { status: 'na' };
      return {
        status: d.security.contentTypeOptions.present ? 'pass' : 'fail',
        detected: d.security.contentTypeOptions.value || 'Header not sent',
        expected: 'nosniff'
      };
    }
  },
  {
    id: 'REFERRER_POLICY_MISSING', category: 'security', severity: 'notice',
    title: 'No Referrer-Policy header',
    why: 'Controls how much of your URL is passed to other sites, which matters when URLs carry tokens or private paths.',
    how: 'Send Referrer-Policy: strict-origin-when-cross-origin.',
    evaluate: (d) => {
      if (!d.security.available) return { status: 'na' };
      return {
        status: d.security.referrerPolicy.present ? 'pass' : 'fail',
        detected: d.security.referrerPolicy.value || 'Header not sent',
        expected: 'strict-origin-when-cross-origin or stricter'
      };
    }
  },
  {
    id: 'CLICKJACKING_PROTECTION_MISSING', category: 'security', severity: 'notice',
    title: 'No clickjacking protection',
    why: 'Without a framing restriction, another site can load your page in an invisible frame and trick users into clicking things.',
    how: 'Send X-Frame-Options: SAMEORIGIN, or a CSP frame-ancestors directive.',
    evaluate: (d) => {
      if (!d.security.available) return { status: 'na' };
      return {
        status: d.security.frameOptions.present ? 'pass' : 'fail',
        detected: d.security.frameOptions.value || 'Neither X-Frame-Options nor CSP frame-ancestors',
        expected: 'X-Frame-Options or frame-ancestors'
      };
    }
  },
  {
    id: 'X_ROBOTS_TAG_NOINDEX', category: 'technical', severity: 'critical',
    title: 'Page is set to noindex by HTTP header',
    why: 'An X-Robots-Tag noindex removes the page from search results just as a meta tag would, but it is invisible in the HTML so it is easily missed.',
    how: 'Remove noindex from the X-Robots-Tag response header if this page should rank.',
    evaluate: (d) => {
      if (!d.security.available) return { status: 'na' };
      const value = (d.security.xRobotsTag || '').toLowerCase();
      return {
        status: value.indexOf('noindex') === -1 ? 'pass' : 'fail',
        detected: d.security.xRobotsTag || 'No X-Robots-Tag header',
        expected: 'No noindex directive'
      };
    }
  },
  {
    id: 'CLIENT_RENDERED_CONTENT', category: 'technical', severity: 'warning',
    title: 'Main content appears to be rendered by JavaScript',
    why: 'The HTML your server sends contains much less text than the finished page. Google renders JavaScript, but rendering is queued and can be delayed, and many other crawlers and AI systems do not render at all.',
    how: 'Consider server-side rendering or static generation for content that matters for search.',
    evaluate: (d) => {
      if (!d.spa || d.spa.confidence === 'unknown' || d.spa.servedWords === undefined) return { status: 'na' };
      return {
        status: d.spa.detected && d.spa.confidence !== 'low' ? 'fail' : 'pass',
        detected: `Served HTML ~${d.spa.servedWords} words, rendered page ~${d.spa.renderedWords} words`,
        expected: 'Key content present in the served HTML',
        evidence: [d.spa.reason]
      };
    }
  },
  /* ----------------------------- PERFORMANCE ----------------------------- */
  {
    id: 'SLOW_FCP', category: 'performance', severity: 'warning',
    title: 'Slow first contentful paint',
    why: 'First Contentful Paint is when the visitor first sees something other than a blank screen. A long delay makes a site feel broken before it has even loaded.',
    how: 'Reduce render-blocking CSS and JavaScript, and prioritise the critical rendering path.',
    evaluate: (d) => {
      const v = d.perf?.firstContentfulPaintMs;
      if (v === null || v === undefined) return { status: 'na' };
      return {
        status: v <= 1800 ? 'pass' : 'fail',
        detected: v + ' ms',
        expected: '1800 ms or less',
        evidence: ['Measured on this page load in your browser — not a Lighthouse lab score.']
      };
    }
  },
  {
    id: 'SLOW_LCP', category: 'performance', severity: 'warning',
    title: 'Slow largest contentful paint',
    why: 'LCP marks when the main content becomes visible, and it is one of the Core Web Vitals Google reports.',
    how: 'Optimise the largest image or text block: serve it at the right size, preload it, and avoid loading it through JavaScript.',
    evaluate: (d) => {
      const v = d.perf?.largestContentfulPaintMs;
      if (v === null || v === undefined) return { status: 'na' };
      return {
        status: v <= 2500 ? 'pass' : 'fail',
        detected: v + ' ms',
        expected: '2500 ms or less',
        evidence: ['This is a single observation from your browser, not CrUX field data across real users.']
      };
    }
  },
  {
    id: 'LAYOUT_SHIFT', category: 'performance', severity: 'warning',
    title: 'Visible layout shift during load',
    why: 'Content moving as the page loads causes mis-clicks and is measured by Cumulative Layout Shift, another Core Web Vital.',
    how: 'Set width and height on images and embeds, and reserve space for anything injected after load.',
    evaluate: (d) => {
      const v = d.perf?.cumulativeLayoutShift;
      if (v === null || v === undefined) return { status: 'na' };
      return {
        status: v <= 0.1 ? 'pass' : 'fail',
        detected: 'CLS ' + v,
        expected: '0.1 or less'
      };
    }
  },
  {
    id: 'EXCESSIVE_RESOURCES', category: 'performance', severity: 'notice',
    title: 'Very high number of page resources',
    why: 'Every request adds connection overhead. Large numbers of small files slow down loading, especially on mobile networks.',
    how: 'Bundle where sensible, remove unused scripts and styles, and lazy-load what is not needed immediately.',
    evaluate: (d) => {
      const n = d.perf?.resourceCount;
      if (n === null || n === undefined || n === 0) return { status: 'na' };
      return {
        status: n <= 100 ? 'pass' : 'fail',
        detected: n + ' resources',
        expected: '100 or fewer'
      };
    }
  },
  {
    id: 'LONG_TASKS', category: 'performance', severity: 'notice',
    title: 'Long JavaScript tasks block the main thread',
    why: 'Tasks over 50 ms freeze the page: taps and clicks do not respond while they run, which is what INP measures.',
    how: 'Break up long-running scripts, defer non-critical work, and move heavy computation off the main thread.',
    evaluate: (d) => {
      const lt = d.perf?.longTasks;
      if (!lt || lt.count === undefined) return { status: 'na' };
      return {
        status: lt.count <= 3 ? 'pass' : 'fail',
        detected: `${lt.count} long tasks, ${lt.totalMs} ms total`,
        expected: '3 or fewer'
      };
    }
  },

  /* ---------------------------- ACCESSIBILITY ---------------------------- */
  {
    id: 'A11Y_ZOOM_BLOCKED', category: 'accessibility', severity: 'critical',
    title: 'Page prevents pinch-zoom',
    why: 'Blocking zoom makes the page unusable for anyone who needs to magnify text. It is one of the most common serious accessibility failures.',
    how: 'Remove user-scalable=no and maximum-scale from the viewport meta tag.',
    evaluate: (d) => {
      if (!d.accessibility?.viewport) return { status: 'na' };
      return {
        status: d.accessibility.blocksZoom ? 'fail' : 'pass',
        detected: d.accessibility.viewport,
        expected: 'A viewport that allows zooming'
      };
    }
  },
  {
    id: 'A11Y_UNLABELLED_INPUTS', category: 'accessibility', severity: 'critical',
    title: 'Form fields without labels',
    why: 'A screen reader announces an unlabelled field as just "edit text", so the user cannot tell what to type.',
    how: 'Give each field a <label for="…">, or an aria-label where a visible label is not wanted.',
    evaluate: (d) => {
      if (!d.accessibility?.inputs) return { status: 'na' };
      return {
        status: d.accessibility.unlabelledInputs === 0 ? 'pass' : 'fail',
        detected: `${d.accessibility.unlabelledInputs} of ${d.accessibility.inputs} fields`,
        expected: 'Every field labelled',
        evidence: d.accessibility.unlabelledInputSamples
      };
    }
  },
  {
    id: 'A11Y_BUTTONS_WITHOUT_NAMES', category: 'accessibility', severity: 'critical',
    title: 'Buttons with no accessible name',
    why: 'Icon-only buttons with no text or aria-label are announced as just "button", giving no clue what they do.',
    how: 'Add visible text or an aria-label describing the action.',
    evaluate: (d) => {
      if (!d.accessibility?.buttons) return { status: 'na' };
      return {
        status: d.accessibility.namelessButtons === 0 ? 'pass' : 'fail',
        detected: `${d.accessibility.namelessButtons} of ${d.accessibility.buttons} buttons`,
        expected: '0'
      };
    }
  },
  {
    id: 'A11Y_LINKS_WITHOUT_NAMES', category: 'accessibility', severity: 'warning',
    title: 'Links with no accessible name',
    why: 'A link with no text, no image alt and no aria-label is unusable with a screen reader, and tells search engines nothing either.',
    how: 'Add link text, alt text on the contained image, or an aria-label.',
    evaluate: (d) => {
      if (!d.accessibility?.links) return { status: 'na' };
      return {
        status: d.accessibility.namelessLinks === 0 ? 'pass' : 'fail',
        detected: `${d.accessibility.namelessLinks} of ${d.accessibility.links} links`,
        expected: '0'
      };
    }
  },
  {
    id: 'A11Y_IFRAME_TITLES', category: 'accessibility', severity: 'notice',
    title: 'Iframes without a title',
    why: 'The title attribute is how a screen reader user knows what an embedded frame contains before entering it.',
    how: 'Add a descriptive title attribute to each iframe.',
    evaluate: (d) => {
      if (!d.accessibility?.iframes) return { status: 'na' };
      return {
        status: d.accessibility.untitledIframes === 0 ? 'pass' : 'fail',
        detected: `${d.accessibility.untitledIframes} of ${d.accessibility.iframes} iframes`,
        expected: '0'
      };
    }
  },
  {
    id: 'A11Y_NO_MAIN_LANDMARK', category: 'accessibility', severity: 'notice',
    title: 'No main landmark',
    why: 'A <main> element lets assistive technology skip navigation and jump straight to the content.',
    how: 'Wrap the primary content in <main>.',
    evaluate: (d) => {
      if (!d.accessibility?.landmarks) return { status: 'na' };
      return {
        status: d.accessibility.landmarks.main > 0 ? 'pass' : 'fail',
        detected: d.accessibility.landmarks.main + ' main landmarks',
        expected: 'Exactly 1'
      };
    }
  },
  {
    id: 'A11Y_POSITIVE_TABINDEX', category: 'accessibility', severity: 'notice',
    title: 'Positive tabindex values in use',
    why: 'A positive tabindex overrides the natural focus order, which usually produces a confusing keyboard experience.',
    how: 'Use tabindex="0" or restructure the DOM so source order matches visual order.',
    evaluate: (d) => {
      if (!d.accessibility) return { status: 'na' };
      return {
        status: d.accessibility.positiveTabindex === 0 ? 'pass' : 'fail',
        detected: d.accessibility.positiveTabindex + ' elements',
        expected: '0'
      };
    }
  },

  /* ------------------------------- MOBILE -------------------------------- */
  {
    id: 'HORIZONTAL_OVERFLOW', category: 'technical', severity: 'warning',
    title: 'Page scrolls sideways',
    why: 'Horizontal overflow forces users to pan around to read, and is a common mobile usability failure.',
    how: 'Find the element wider than the viewport and constrain it — usually a fixed width, a wide table, or an unbounded image.',
    evaluate: (d) => {
      if (!d.mobile || !d.mobile.documentWidth) return { status: 'na' };
      return {
        status: d.mobile.horizontalOverflow ? 'fail' : 'pass',
        detected: `Document ${d.mobile.documentWidth}px in a ${d.mobile.viewportWidth}px viewport`,
        expected: 'Content fits the viewport width',
        evidence: d.mobile.overflowSamples
      };
    }
  },

  {
    id: 'FAVICON_MISSING', category: 'technical', severity: 'notice',
    title: 'No favicon declared',
    why: 'The favicon appears next to your result on mobile search and in browser tabs.',
    how: 'Add a link rel="icon" in the head.',
    evaluate: (d) => ({
      status: d.head.favicon ? 'pass' : 'fail',
      detected: d.head.favicon || 'Not declared',
      expected: 'A link rel="icon"'
    })
  },

  /* ------------------------------- GEO / AEO ----------------------------- */
  {
    id: 'AI_CRAWLER_BLOCKED', category: 'geo', severity: 'warning',
    title: 'AI crawlers are blocked from this URL',
    why: 'Blocked AI crawlers cannot cite or surface your content in AI answers. This is a legitimate choice for some publishers, so treat it as a decision to confirm rather than an error.',
    how: 'If you want visibility in AI search, allow the AI search crawlers in robots.txt.',
    evaluate: (d) => {
      if (!d.robots.bots.length) return { status: 'na' };
      const blocked = d.robots.bots.filter(b => !b.allowed);
      return {
        status: blocked.length === 0 ? 'pass' : 'fail',
        detected: blocked.length ? blocked.map(b => b.name).join(', ') : 'All checked crawlers allowed',
        expected: 'Allowed, if AI visibility is a goal',
        evidence: blocked.map(b => b.name + ' — ' + (b.rule || 'blocked by group rule'))
      };
    }
  },
  {
    id: 'LLMS_TXT_MISSING', category: 'geo', severity: 'notice',
    title: 'No llms.txt file',
    why: 'llms.txt is an emerging convention for pointing AI systems at your key content. It is not a Google ranking factor and no major engine requires it — treat it as an optional AI-readiness signal.',
    how: 'Optionally publish /llms.txt listing your most important pages.',
    evaluate: (d) => {
      const found = d.llms.filter(f => f.state === 'FOUND');
      return {
        status: found.length > 0 ? 'pass' : 'fail',
        detected: d.llms.map(f => f.file + ': ' + f.state).join(', '),
        expected: '/llms.txt present (optional)'
      };
    }
  },
  {
    id: 'NO_QUESTION_HEADINGS', category: 'geo', severity: 'notice',
    title: 'No question-style headings',
    why: 'Headings phrased as questions map directly onto how people prompt AI assistants and search engines, making passages easier to extract as answers.',
    how: 'Where it fits the content, phrase subheadings as the question the section answers.',
    evaluate: (d) => {
      if (d.content.wordCount < 300) return { status: 'na' };
      return {
        status: d.headingStats.questions > 0 ? 'pass' : 'fail',
        detected: d.headingStats.questions + ' question headings',
        expected: 'At least one where relevant'
      };
    }
  },
  {
    id: 'NO_STRUCTURED_BLOCKS', category: 'geo', severity: 'notice',
    title: 'No lists or tables in the content',
    why: 'Lists and tables are the formats answer engines most reliably lift into responses.',
    how: 'Convert dense comparisons and step sequences into tables and lists.',
    evaluate: (d) => {
      if (d.content.wordCount < 300) return { status: 'na' };
      return {
        status: (d.content.lists > 0 || d.content.tables > 0) ? 'pass' : 'fail',
        detected: d.content.lists + ' lists, ' + d.content.tables + ' tables',
        expected: 'At least one list or table'
      };
    }
  },
  {
    id: 'NO_AUTHOR_SIGNAL', category: 'geo', severity: 'notice',
    title: 'No author signal',
    why: 'Named, attributable authorship supports credibility assessment by both search engines and AI systems.',
    how: 'Add a visible byline and an author property in your structured data.',
    evaluate: (d) => {
      const has = d.schema.hasAuthor || !!d.content.authorMeta || d.content.authorRel;
      return {
        status: has ? 'pass' : 'fail',
        detected: has ? 'Author signal found' : 'No author meta, markup or byline detected',
        expected: 'A byline or schema author property'
      };
    }
  },
  {
    id: 'NO_DATE_SIGNAL', category: 'geo', severity: 'notice',
    title: 'No publication or update date',
    why: 'Dates let engines judge freshness, which matters heavily for anything time-sensitive.',
    how: 'Publish datePublished and dateModified in structured data and show the date on the page.',
    evaluate: (d) => {
      const has = d.schema.hasDatePublished || d.schema.hasDateModified ||
        !!d.content.publishedMeta || !!d.content.modifiedMeta || d.content.timeElements.length > 0;
      return {
        status: has ? 'pass' : 'fail',
        detected: has ? 'Date signal found' : 'No date metadata detected',
        expected: 'datePublished / dateModified'
      };
    }
  },
  {
    id: 'NO_SAMEAS', category: 'geo', severity: 'notice',
    title: 'No sameAs entity links',
    why: 'sameAs connects your brand to its profiles elsewhere, which is how engines resolve you to a known entity.',
    how: 'Add sameAs to your Organization schema pointing at your official profiles.',
    evaluate: (d) => {
      if (d.schema.jsonLdBlocks === 0) return { status: 'na' };
      return {
        status: d.schema.hasSameAs ? 'pass' : 'fail',
        detected: d.schema.hasSameAs ? 'Present' : 'Not found',
        expected: 'sameAs array on Organization or Person'
      };
    }
  },
  {
    id: 'NO_OUTBOUND_CITATIONS', category: 'geo', severity: 'notice',
    title: 'No outbound citations',
    why: 'Linking to sources is a credibility signal and is common in content that AI systems cite.',
    how: 'Cite primary sources where you make factual or statistical claims.',
    evaluate: (d) => {
      if (d.content.wordCount < 400) return { status: 'na' };
      return {
        status: d.linkStats.external > 0 ? 'pass' : 'fail',
        detected: d.linkStats.external + ' external links across ' + d.linkStats.externalDomains + ' domains',
        expected: 'At least one cited source'
      };
    }
  },
  {
    id: 'NO_DIRECT_ANSWER', category: 'geo', severity: 'notice',
    title: 'Opening paragraph is not a concise answer',
    why: 'A tight opening paragraph is the passage most likely to be extracted as a direct answer.',
    how: 'Open with a 40–80 word summary that answers the page question outright.',
    evaluate: (d) => {
      if (d.content.wordCount < 300 || d.content.paragraphs === 0) return { status: 'na' };
      const w = d.content.firstParagraphWords;
      return {
        status: (w >= 20 && w <= 120) ? 'pass' : 'fail',
        detected: 'First paragraph is ' + w + ' words',
        expected: 'Roughly 20–120 words'
      };
    }
  }
];

/**
 * Runs every rule and produces issues plus explainable scores.
 *
 * Two-stage scoring:
 *   1. Each category scores earned/applicable severity weight.
 *   2. The overall score is a weighted mean of the category scores, using
 *      SCC_WEIGHTS. Categories with no applicable checks are dropped from both
 *      sides, so they neither help nor hurt.
 *
 * `explanation` carries everything needed to render "how this score was
 * calculated" without recomputing anything.
 */
function SCC_AUDIT(data, weights) {
  const W = weights || SCC_WEIGHTS;
  const issues = [];
  const passed = [];
  const catTotals = {};

  SCC_CATEGORIES.forEach(c => { catTotals[c.id] = { earned: 0, possible: 0, checks: 0, failed: 0 }; });

  SCC_RULES.forEach(rule => {
    let result;
    try {
      result = rule.evaluate(data) || { status: 'na' };
    } catch (e) {
      // A rule that throws must not be scored as a pass.
      result = { status: 'na', detected: 'Rule error: ' + e.message };
    }
    if (result.status === 'na') return;

    const weight = SCC_SEVERITY_WEIGHT[rule.severity];
    const bucket = catTotals[rule.category];
    if (!bucket) return;
    bucket.possible += weight;
    bucket.checks += 1;

    const record = {
      id: rule.id, category: rule.category, severity: rule.severity,
      title: rule.title, why: rule.why, how: rule.how,
      detected: result.detected || '', expected: result.expected || '',
      evidence: result.evidence || [], status: result.status
    };

    if (result.status === 'pass') { bucket.earned += weight; passed.push(record); }
    else { bucket.failed += 1; issues.push(record); }
  });

  const order = { critical: 0, warning: 1, notice: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  const scores = {};
  SCC_CATEGORIES.forEach(c => {
    const t = catTotals[c.id];
    scores[c.id] = t.possible > 0 ? Math.round((t.earned / t.possible) * 100) : null;
  });

  let weightedSum = 0, weightTotal = 0;
  const contributions = [];
  SCC_CATEGORIES.forEach(c => {
    if (scores[c.id] === null) {
      contributions.push({ id: c.id, label: c.label, score: null, weight: W[c.id] || 0, applied: false, checks: 0 });
      return;
    }
    const w = W[c.id] || 0;
    weightedSum += scores[c.id] * w;
    weightTotal += w;
    contributions.push({
      id: c.id, label: c.label, score: scores[c.id], weight: w, applied: true,
      checks: catTotals[c.id].checks, failed: catTotals[c.id].failed,
      passed: catTotals[c.id].checks - catTotals[c.id].failed,
      passedOfChecks: `${catTotals[c.id].checks - catTotals[c.id].failed} of ${catTotals[c.id].checks}`
    });
  });

  const overall = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null;

  return {
    issues, passed, scores, overall,
    weights: W,
    explanation: {
      method: 'Each category scores the severity-weighted share of its applicable checks that passed (critical 5, warning 2, notice 1). The overall score is the weighted mean of those category scores.',
      contributions,
      totalWeightApplied: weightTotal,
      categoriesExcluded: contributions.filter(c => !c.applied).map(c => c.label)
    },
    counts: {
      critical: issues.filter(i => i.severity === 'critical').length,
      warning: issues.filter(i => i.severity === 'warning').length,
      notice: issues.filter(i => i.severity === 'notice').length,
      passed: passed.length,
      evaluated: issues.length + passed.length,
      totalRules: SCC_RULES.length,
      notApplicable: SCC_RULES.length - (issues.length + passed.length),
      passedOfEvaluated: `${passed.length} of ${issues.length + passed.length}`,
      evaluatedOfTotal: `${issues.length + passed.length} of ${SCC_RULES.length}`
    }
  };
}

if (typeof module !== 'undefined') {
  module.exports = { SCC_RULES, SCC_AUDIT, SCC_CATEGORIES, SCC_WEIGHTS, SCC_SEVERITY_WEIGHT };
}
