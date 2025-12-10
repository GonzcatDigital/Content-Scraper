import config from "./config.js";
import { JSDOM } from "jsdom";
import fs from "fs/promises";
import path from "path";
import TurndownService from "turndown";

// ============================================
// UTILITIES
// ============================================

/**
 * Extract slug from URL
 */
function getSlugFromUrl(url) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.replace(/\/$/, ''); // Remove trailing slash
    return pathname.split('/').filter(Boolean).pop() || 'index';
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Download a file from URL and save to disk
 */
async function downloadFile(url, outputPath) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`  ⚠ Failed to download: ${url} (${response.status})`);
            return false;
        }
        const buffer = await response.arrayBuffer();
        await fs.writeFile(outputPath, Buffer.from(buffer));
        return true;
    } catch (error) {
        console.warn(`  ⚠ Error downloading ${url}: ${error.message}`);
        return false;
    }
}

/**
 * Get file extension from URL
 */
function getExtensionFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').filter(Boolean).pop() || '';
        const ext = path.extname(filename);
        return ext || '.jpg';
    } catch {
        return '.jpg';
    }
}

/**
 * Generate image filename based on pattern
 */
function generateImageFilename(pattern, slug, index, extension) {
    const filename = pattern
        .replace('{slug}', slug)
        .replace('{index}', String(index).padStart(2, '0'));
    return filename + extension;
}

/**
 * Extract the last URL from a srcset attribute
 * srcset format: "url1 300w, url2 600w, url3 1200w" or "url1, url2, url3"
 * Converts relative URLs to absolute using baseUrl
 * Returns the last URL in the list, or null if srcset is invalid/empty
 */
function getLastUrlFromSrcset(srcset, baseUrl) {
    if (!srcset || typeof srcset !== 'string') {
        return null;
    }

    // Split by comma to get individual entries
    const entries = srcset.split(',').map(entry => entry.trim());
    
    if (entries.length === 0) {
        return null;
    }

    // Get the last entry
    const lastEntry = entries[entries.length - 1];
    
    // Extract URL (everything before the first space, or entire string if no space)
    // This handles both "url 300w" and "url" formats
    let url = lastEntry.split(/\s+/)[0].trim();
    
    // If URL is already absolute, return it
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    
    // If URL is relative and we have a baseUrl, convert to absolute
    if (baseUrl && url) {
        try {
            // Use URL constructor to resolve relative URL against baseUrl
            const absoluteUrl = new URL(url, baseUrl).href;
            return absoluteUrl;
        } catch (error) {
            // If URL construction fails, return null
            return null;
        }
    }
    
    return null;
}

// ============================================
// HTML PARSING
// ============================================

/**
 * Fetch page HTML content
 */
async function getPageContent(url) {
    const response = await fetch(url);
    const html = await response.text();
    return html;
}

/**
 * Get single element from HTML using selector
 */
function getElementFromHTML(html, selector) {
    const dom = new JSDOM(html);
    return dom.window.document.querySelector(selector);
}

// ============================================
// DATA EXTRACTION
// ============================================

/**
 * Create page data object from HTML based on config.DATA
 * Returns frontmatter, content, and null fields for reporting
 */
function createPageDataObject(url, html) {
    let frontmatter = {};
    let content = null;
    let nullFields = []; // Track fields that returned null/undefined

    for (const [key, item] of Object.entries(config.DATA)) {
        const fieldName = key.toLowerCase().replace(/_/g, '');

        // Static string value
        if (typeof item === 'string') {
            frontmatter[fieldName] = item;
            continue;
        }

        // Extract from URL (special case)
        if (item.fromUrl && item.getValue) {
            const value = item.getValue(url);
            frontmatter[fieldName] = value ?? null;
            if (value === null || value === undefined || value === '') {
                nullFields.push(fieldName);
            }
            continue;
        }

        // Dynamic value from selector
        if (item.selector && item.getValue) {
            const element = getElementFromHTML(html, item.selector);

            if (!element) {
                console.warn(`  ⚠ No element found for "${key}" with selector "${item.selector}"`);
                if (!item.isContent) {
                    frontmatter[fieldName] = null;
                    nullFields.push(fieldName);
                }
                continue;
            }

            const value = item.getValue(element);

            // Check if this is the content field (body)
            if (item.isContent) {
                content = value;
            } else {
                frontmatter[fieldName] = value ?? null;

                // Track null values
                if (value === null || value === undefined || value === '') {
                    nullFields.push(fieldName);
                }
            }
        } else if (typeof item === 'object' && !item.selector) {
            // Object without selector - treat as static value
            frontmatter[fieldName] = item;
        }
    }

    return { frontmatter, content, nullFields };
}

/**
 * Extract featured image URL and alt text from HTML
 * Returns { url, alt } or null if featuredImage config is disabled
 */
function extractFeaturedImage(html) {
    const featuredConfig = config.IMAGE_EXTRACTION.featuredImage;

    // Disabled if null
    if (!featuredConfig) return null;

    const element = getElementFromHTML(html, featuredConfig.selector);
    if (!element) {
        console.warn(`  ⚠ No element found for featured image with selector "${featuredConfig.selector}"`);
        return { url: null, alt: null };
    }

    const url = featuredConfig.getValue(element) || null;

    // Get alt text - can use a different selector
    let alt = '';
    if (featuredConfig.getAlt) {
        const altElement = featuredConfig.altSelector
            ? getElementFromHTML(html, featuredConfig.altSelector)
            : element;
        alt = altElement ? featuredConfig.getAlt(altElement) : '';
    }

    return { url, alt };
}

// ============================================
// MARKDOWN PROCESSING
// ============================================

/**
 * Preprocess HTML to fix lazy-loaded images
 * Prioritizes nitro-lazy-srcset > srcset > src > lazy-load attributes
 */
function preprocessLazyImages(html) {
    if (!html) return html;

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Common lazy-loading attributes (in priority order)
    const lazyAttrs = ['nitro-lazy-src', 'data-src', 'data-lazy-src', 'data-original'];

    // Get baseUrl from config for converting relative URLs
    const baseUrl = config.BASE_URL;

    const images = document.querySelectorAll('img');
    for (const img of images) {
        // Priority 1: Check nitro-lazy-srcset first - extract last URL (typically largest)
        const nitroSrcset = img.getAttribute('nitro-lazy-srcset');
        if (nitroSrcset) {
            const srcsetUrl = getLastUrlFromSrcset(nitroSrcset, baseUrl);
            if (srcsetUrl) {
                img.setAttribute('src', srcsetUrl);
                continue; // Use nitro-lazy-srcset URL, skip other checks
            }
        }

        // Priority 2: Check regular srcset - extract last URL
        const srcset = img.getAttribute('srcset');
        if (srcset) {
            const srcsetUrl = getLastUrlFromSrcset(srcset, baseUrl);
            if (srcsetUrl) {
                img.setAttribute('src', srcsetUrl);
                continue; // Use srcset URL, skip other checks
            }
        }

        // Priority 3: Check if src is a valid HTTP URL
        const currentSrc = img.getAttribute('src') || '';
        const hasValidSrc = currentSrc.startsWith('http://') || currentSrc.startsWith('https://');
        
        if (hasValidSrc) {
            // src already has a valid URL - keep it, don't check lazy-load attributes
            continue;
        }
        
        // Priority 4: Check lazy-load attributes if src is a placeholder (data: URI or empty)
        const isPlaceholder = currentSrc.startsWith('data:') || currentSrc === '';

        if (isPlaceholder) {
            // Find the real src from lazy-load attributes
            for (const attr of lazyAttrs) {
                const realSrc = img.getAttribute(attr);
                if (realSrc && realSrc.startsWith('http')) {
                    img.setAttribute('src', realSrc);
                    break;
                }
            }
        }
    }

    return document.body.innerHTML;
}

/**
 * Sanitize HTML by removing styles/classes from common tags and formatting
 */
function sanitizeHtml(html) {
    if (!html) return html;

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Tags to clean (remove style and class attributes)
    const tagsToClean = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 'div', 'strong', 'em', 'b', 'i'];

    for (const tag of tagsToClean) {
        const elements = document.querySelectorAll(tag);
        for (const el of elements) {
            el.removeAttribute('style');
            el.removeAttribute('class');
        }
    }

    // Unwrap span tags (replace with their contents)
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
        span.replaceWith(...span.childNodes);
    }

    // Clean img tags - keep only src and alt
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
        const src = img.getAttribute('src');
        const alt = img.getAttribute('alt') || '';
        
        // Remove all attributes
        while (img.attributes.length > 0) {
            img.removeAttribute(img.attributes[0].name);
        }
        
        // Add back only essential ones
        if (src) img.setAttribute('src', src);
        if (alt) img.setAttribute('alt', alt);
    }

    // Unwrap script tags from p tags (keep the script, remove the p wrapper)
    const scriptsInP = document.querySelectorAll('p > script');
    for (const script of scriptsInP) {
        const p = script.parentElement;
        p.replaceWith(script);
    }

    // Unwrap images from h2 tags (h2 containing only an img)
    const h2s = document.querySelectorAll('h2');
    for (const h2 of h2s) {
        const img = h2.querySelector('img');
        if (img && h2.children.length === 1 && h2.textContent.trim() === '') {
            h2.replaceWith(img);
        }
    }

    // Remove empty paragraphs (containing only whitespace or &nbsp;)
    const paragraphs = document.querySelectorAll('p');
    for (const p of paragraphs) {
        const text = p.textContent.trim().replace(/\u00A0/g, ''); // \u00A0 is &nbsp;
        if (text === '' && p.querySelectorAll('img, a').length === 0) {
            p.remove();
        }
    }

    // Get cleaned HTML and format with line breaks
    let result = document.body.innerHTML;
    
    // Add line breaks after block elements
    result = result.replace(/<\/(h[1-6]|p|div|ul|ol|li)>/gi, '</$1>\n');
    // Add line breaks before block elements
    result = result.replace(/<(h[1-6]|p|ul|ol)[^>]*>/gi, '\n<$1>');
    // Add line breaks before li elements
    result = result.replace(/<li/gi, '\n<li');
    // Add line breaks around img elements
    result = result.replace(/<img /gi, '\n<img ');
    result = result.replace(/(<img [^>]+>)/gi, '$1\n');

    return result.trim();
}

/**
 * Convert HTML content to Markdown (no URL rewriting - that happens after)
 */
function htmlToMarkdown(html) {
    if (!html) return '';

    // Preprocess to fix lazy-loaded images before conversion
    const processedHtml = preprocessLazyImages(html);

    const turndown = new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
    });

    // Handle <a> tags that wrap images - output just the image, not a linked image
    // This prevents broken syntax like: [\n![alt](url)](url)
    turndown.addRule('linkedImages', {
        filter: (node) => {
            return node.nodeName === 'A' && node.querySelector('img');
        },
        replacement: (content, node) => {
            const img = node.querySelector('img');
            if (!img) return content;

            const src = img.getAttribute('src') || '';
            const alt = img.getAttribute('alt') || '';
            return `![${alt}](${src})`;
        }
    });

    // Handle standalone images
    turndown.addRule('images', {
        filter: 'img',
        replacement: (content, node) => {
            const src = node.getAttribute('src') || '';
            const alt = node.getAttribute('alt') || '';
            return `![${alt}](${src})`;
        }
    });

    return turndown.turndown(processedHtml);
}

/**
 * Extract all remote image URLs from markdown content
 * Returns array of { url, alt } objects (deduplicated, in order)
 */
function extractImagesFromMarkdown(markdown) {
    const imageRegex = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g;
    const images = [];
    const seen = new Set();

    let match;
    while ((match = imageRegex.exec(markdown)) !== null) {
        const alt = match[1];
        const url = match[2];

        // Apply filter if configured, deduplicate
        const filter = config.IMAGE_EXTRACTION.filter;
        if (!seen.has(url) && (!filter || filter(url))) {
            seen.add(url);
            images.push({ url, alt });
        }
    }

    return images;
}

/**
 * Extract all remote image URLs from HTML content
 * Prioritizes nitro-lazy-srcset > srcset > src > lazy-load attributes
 * Returns array of { url, alt } objects (deduplicated, in order)
 */
function extractImagesFromHtml(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const images = [];
    const seen = new Set();

    // Common lazy-loading attributes (fallback only)
    const lazyAttrs = ['nitro-lazy-src', 'data-src', 'data-lazy-src', 'data-original'];

    // Get baseUrl from config for converting relative URLs
    const baseUrl = config.BASE_URL;

    const imgElements = document.querySelectorAll('img');
    for (const img of imgElements) {
        const alt = img.getAttribute('alt') || '';
        let url = '';

        // Priority 1: Check nitro-lazy-srcset first - extract last URL (typically largest)
        const nitroSrcset = img.getAttribute('nitro-lazy-srcset');
        if (nitroSrcset) {
            const srcsetUrl = getLastUrlFromSrcset(nitroSrcset, baseUrl);
            if (srcsetUrl) {
                url = srcsetUrl;
            }
        }

        // Priority 2: Check regular srcset - extract last URL
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
            const srcset = img.getAttribute('srcset');
            if (srcset) {
                const srcsetUrl = getLastUrlFromSrcset(srcset, baseUrl);
                if (srcsetUrl) {
                    url = srcsetUrl;
                }
            }
        }

        // Priority 3: Fall back to src if no srcset URL found
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
            url = img.getAttribute('src') || '';
        }

        // Priority 4: Fall back to lazy-load attributes if src is not a valid HTTP URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            for (const attr of lazyAttrs) {
                const lazySrc = img.getAttribute(attr);
                if (lazySrc && lazySrc.startsWith('http')) {
                    url = lazySrc;
                    break;
                }
            }
        }

        // Only process remote URLs, deduplicate
        if (url.startsWith('http') && !seen.has(url)) {
            const filter = config.IMAGE_EXTRACTION.filter;
            if (!filter || filter(url)) {
                seen.add(url);
                images.push({ url, alt });
            }
        }
    }

    return images;
}

/**
 * Download images and rewrite URLs in content (markdown or HTML)
 * Returns { content, downloadedCount, failedCount, totalFound }
 */
async function downloadAndRewriteImages(content, slug, isHtml = false) {
    const images = isHtml ? extractImagesFromHtml(content) : extractImagesFromMarkdown(content);
    let result = content;
    let downloadedCount = 0;
    let failedCount = 0;
    let index = 1;

    for (const { url, alt } of images) {
        const extension = getExtensionFromUrl(url);
        const pattern = config.IMAGE_EXTRACTION.filenamePattern || "{slug}-{index}";
        const filename = generateImageFilename(pattern, slug, index, extension);
        const outputPath = path.join(config.OUTPUT.IMAGES_DIR, filename);
        const localPath = `${config.IMAGE_EXTRACTION.relativePath}${filename}`;

        const success = await downloadFile(url, outputPath);
        if (success) {
            // Rewrite URL in markdown
            result = result.replaceAll(url, localPath);
            downloadedCount++;
            index++;
        } else {
            failedCount++;
        }
    }

    return { content: result, downloadedCount, failedCount, totalFound: images.length };
}

/**
 * Count remaining remote images in content (markdown or HTML)
 */
function countRemoteImages(content, isHtml = false) {
    if (isHtml) {
        const htmlImageRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/g;
        const matches = content.match(htmlImageRegex);
        return matches ? matches.length : 0;
    } else {
        const mdImageRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
        const matches = content.match(mdImageRegex);
        return matches ? matches.length : 0;
    }
}

// ============================================
// OUTPUT GENERATION
// ============================================

/**
 * Generate YAML frontmatter string
 */
function generateFrontmatter(data) {
    let yaml = '---\n';

    for (const [key, value] of Object.entries(data)) {
        // Handle null/undefined - output as null in YAML
        if (value === null || value === undefined) {
            yaml += `${key}: null\n`;
            continue;
        }

        // Handle different value types
        if (typeof value === 'string') {
            // Always wrap strings in quotes, escape any internal quotes
            yaml += `${key}: "${value.replace(/"/g, '\\"')}"\n`;
        } else if (Array.isArray(value)) {
            yaml += `${key}:\n`;
            for (const item of value) {
                yaml += `  - ${item}\n`;
            }
        } else {
            yaml += `${key}: ${value}\n`;
        }
    }

    yaml += '---\n\n';
    return yaml;
}

/**
 * Generate markdown file content
 */
function generateMarkdown(frontmatter, content) {
    const yaml = generateFrontmatter(frontmatter);
    return yaml + (content || '');
}

// ============================================
// MAIN PROCESSING
// ============================================

/**
 * Process a single URL
 */
async function processUrl(url) {
    const slug = getSlugFromUrl(url);
    console.log(`\n📄 Processing: ${slug}`);
    console.log(`   URL: ${url}`);

    // Fetch page content
    const html = await getPageContent(url);

    // Extract data (frontmatter, content HTML, and null fields)
    const { frontmatter, content, nullFields } = createPageDataObject(url, html);
    const featuredImage = extractFeaturedImage(html);

    // Create output directories
    await ensureDir(config.OUTPUT.CONTENT_DIR);
    await ensureDir(config.OUTPUT.IMAGES_DIR);

    // Check if body should be HTML or Markdown
    const bodyConfig = config.DATA.BODY;
    const isHtml = bodyConfig?.isHtml || false;

    // Step 1: Get body content - HTML or Markdown based on config
    let rawContent;
    if (isHtml) {
        // Keep as HTML, preprocess lazy images and sanitize
        rawContent = preprocessLazyImages(content);
        rawContent = sanitizeHtml(rawContent);
    } else {
        // Convert to Markdown
        rawContent = htmlToMarkdown(content);
    }

    // Step 2: Find all remote images, download them, rewrite URLs
    const { content: processedContent, downloadedCount, totalFound } =
        await downloadAndRewriteImages(rawContent, slug, isHtml);

    console.log(`   Found ${totalFound} images in content, downloaded ${downloadedCount}`);

    // Handle featured image (if enabled)
    const featuredConfig = config.IMAGE_EXTRACTION.featuredImage;
    let firstBodyImagePath = null;

    // Track the first downloaded image for fallback (markdown only)
    if (!isHtml) {
        const firstImageMatch = processedContent.match(/!\[.*?\]\(([^)]+)\)/);
        if (firstImageMatch && !firstImageMatch[1].startsWith('http')) {
            firstBodyImagePath = firstImageMatch[1];
        }
    }

    if (featuredConfig) {
        const frontmatterKey = featuredConfig.frontmatterKey || 'featuredImage';
        const altFrontmatterKey = featuredConfig.altFrontmatterKey || 'featuredImageAlt';

        if (featuredImage?.url) {
            // Download featured image with its custom pattern
            const extension = getExtensionFromUrl(featuredImage.url);
            const pattern = featuredConfig.filenamePattern || "{slug}-featured";
            const filename = pattern.replace('{slug}', slug) + extension;
            const outputPath = path.join(config.OUTPUT.IMAGES_DIR, filename);

            const success = await downloadFile(featuredImage.url, outputPath);
            if (success) {
                frontmatter[frontmatterKey] = `${config.IMAGE_EXTRACTION.relativePath}${filename}`;
                frontmatter[altFrontmatterKey] = featuredImage.alt || null;
                console.log(`   ✓ Downloaded featured image: ${filename}`);
            } else if (firstBodyImagePath) {
                // Fallback to first body image on download failure
                frontmatter[frontmatterKey] = firstBodyImagePath;
                frontmatter[altFrontmatterKey] = featuredImage.alt || null;
                console.log(`   ℹ Using first image as fallback for featured image`);
            } else {
                frontmatter[frontmatterKey] = null;
                frontmatter[altFrontmatterKey] = null;
                nullFields.push(frontmatterKey);
            }
        } else if (firstBodyImagePath) {
            // No featured image found - fallback to first body image
            frontmatter[frontmatterKey] = firstBodyImagePath;
            frontmatter[altFrontmatterKey] = featuredImage?.alt || null;
            console.log(`   ℹ Using first image as fallback for featured image`);
        } else {
            frontmatter[frontmatterKey] = null;
            frontmatter[altFrontmatterKey] = null;
            nullFields.push(frontmatterKey);
        }
    }

    // Extract H1 from page for prepending (if isHtml)
    const h1Element = getElementFromHTML(html, 'h1');
    const h1Text = h1Element?.textContent?.trim() || '';

    // Extract scripts to place after container div
    let scripts = '';
    let contentWithoutScripts = processedContent;
    if (isHtml) {
        const scriptRegex = /<script[\s\S]*?<\/script>/gi;
        const scriptMatches = processedContent.match(scriptRegex) || [];
        scripts = scriptMatches.join('\n');
        // Replace specific image URL in scripts
        scripts = scripts.replace(
            /https:\/\/phxinjurylaw\.com\/wp-content\/uploads\/[^"]+/g,
            'https://phxinjurylaw.com/assets/images/banner.jpg'
        );
        contentWithoutScripts = processedContent.replace(scriptRegex, '').trim();
    }

    // Wrap HTML content in container div if isHtml
    const h1Html = h1Text ? `<h1 class="cs-title">${h1Text}</h1>\n\n` : '';
    let wrappedContent;
    if (isHtml) {
        // Indent all content by 4 spaces
        const indentedContent = (h1Html + contentWithoutScripts)
            .split('\n')
            .map(line => line ? '    ' + line : line)
            .join('\n');
        wrappedContent = `<div class="cs-content">\n${indentedContent}\n</div>\n${scripts}`;
    } else {
        wrappedContent = processedContent;
    }

    // Generate and write output file
    const finalContent = generateMarkdown(frontmatter, wrappedContent);
    const outputPath = path.join(config.OUTPUT.CONTENT_DIR, `${slug}.html`);
    await fs.writeFile(outputPath, finalContent, 'utf-8');

    // Count images that weren't downloaded (still have remote URLs)
    const remoteImageCount = countRemoteImages(processedContent, isHtml);
    if (remoteImageCount > 0) {
        console.warn(`   ⚠ ${remoteImageCount} images not downloaded (still remote URLs)`);
    }

    console.log(`   ✓ Created: ${outputPath}`);

    return { slug, frontmatter, downloadedCount, remoteImageCount, nullFields };
}

/**
 * Main entry point
 */
async function init() {
    console.log('🚀 Interior Migrator');
    console.log(`   Processing ${config.URLS.length} URLs`);
    console.log(`   Content output: ${config.OUTPUT.CONTENT_DIR}`);
    console.log(`   Images output: ${config.OUTPUT.IMAGES_DIR}`);

    const results = [];

    for (const url of config.URLS) {
        try {
            const result = await processUrl(url);
            results.push({ url, ...result, success: true });
        } catch (error) {
            console.error(`\n❌ Error processing ${url}:`, error.message);
            results.push({ url, success: false, error: error.message });
        }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const withNulls = successful.filter(r => r.nullFields && r.nullFields.length > 0);
    const withRemoteImages = successful.filter(r => r.remoteImageCount > 0);
    const totalRemoteImages = withRemoteImages.reduce((sum, r) => sum + r.remoteImageCount, 0);
    const totalDownloaded = successful.reduce((sum, r) => sum + (r.downloadedCount || 0), 0);

    // Quick overview
    console.log(`✓ Successful: ${successful.length}`);
    console.log(`✗ Failed: ${failed.length}`);
    console.log(`📷 Total images downloaded: ${totalDownloaded}`);
    console.log(`⚠ Pages with missing fields: ${withNulls.length}`);
    console.log(`⚠ Pages with remote images: ${withRemoteImages.length} (${totalRemoteImages} images total)`);

    // Detailed breakdowns
    if (failed.length > 0) {
        console.log('\n' + '-'.repeat(50));
        console.log('❌ Failed URLs:');
        for (const f of failed) {
            console.log(`  - ${f.url}: ${f.error}`);
        }
    }

    if (withNulls.length > 0) {
        console.log('\n' + '-'.repeat(50));
        console.log('⚠ Pages with null/missing data fields:');
        for (const r of withNulls) {
            console.log(`  - ${r.slug}: ${r.nullFields.join(', ')}`);
        }
    }

    if (withRemoteImages.length > 0) {
        console.log('\n' + '-'.repeat(50));
        console.log('⚠ Pages with images not downloaded (still remote URLs):');
        for (const r of withRemoteImages) {
            console.log(`  - ${r.slug}: ${r.remoteImageCount} images`);
        }
    }

    console.log('\n✅ Migration complete!');
}

init();
