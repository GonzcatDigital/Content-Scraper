import config from "./config.js";
import { JSDOM } from "jsdom";
import fs from "fs/promises";
import path from "path";
import TurndownService from "turndown";

// ============================================
// UTILITIES
// ============================================

// Some hosts (WordPress security plugins, Cloudflare) block Node's default user agent
const FETCH_OPTIONS = {
    headers: { "User-Agent": config.USER_AGENT || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
};

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
        const response = await fetch(url, FETCH_OPTIONS);
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

// ============================================
// HTML PARSING
// ============================================

/**
 * Fetch page HTML content
 */
async function getPageContent(url) {
    const response = await fetch(url, FETCH_OPTIONS);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
 * Convert HTML content to Markdown (no URL rewriting - that happens after)
 */
function htmlToMarkdown(html) {
    if (!html) return '';

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

    return turndown.turndown(html);
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
 * Download images and rewrite URLs in markdown
 * Returns { markdown, downloadedCount, failedCount }
 */
async function downloadAndRewriteImages(markdown, slug) {
    const images = extractImagesFromMarkdown(markdown);
    let result = markdown;
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

    return { markdown: result, downloadedCount, failedCount, totalFound: images.length };
}

/**
 * Rewrite link targets in markdown using config.LINKS.rewrite(href, slug)
 * Images are left alone (they're handled by downloadAndRewriteImages)
 */
function rewriteLinks(markdown, slug) {
    const rewrite = config.LINKS?.rewrite;
    if (!rewrite) return markdown;

    return markdown.replace(/(?<!!)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (match, text, href, title) => {
        const newHref = rewrite(href, slug);
        // Returning null/false unlinks: keep the anchor text only
        if (!newHref) return text;
        return `[${text}](${newHref}${title})`;
    });
}

/**
 * Count remaining remote images in markdown (images that failed to download)
 */
function countRemoteImages(markdown) {
    const remoteImageRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
    const matches = markdown.match(remoteImageRegex);
    return matches ? matches.length : 0;
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
        // Plain YYYY-MM-DD dates stay unquoted so YAML/Eleventy read them as real dates
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            yaml += `${key}: ${value}\n`;
        } else if (typeof value === 'string') {
            // JSON-quoted strings are valid YAML and safely handle quotes, colons, apostrophes, etc.
            yaml += `${key}: ${JSON.stringify(value)}\n`;
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

    // Step 1: Convert HTML to Markdown (no URL rewriting yet)
    const rawMarkdown = rewriteLinks(htmlToMarkdown(content), slug);

    // Step 2: Find all remote images in markdown, download them, rewrite URLs
    const { markdown: processedMarkdown, downloadedCount, totalFound } =
        await downloadAndRewriteImages(rawMarkdown, slug);

    console.log(`   Found ${totalFound} images in content, downloaded ${downloadedCount}`);

    // Handle featured image (if enabled)
    const featuredConfig = config.IMAGE_EXTRACTION.featuredImage;
    let firstBodyImagePath = null;

    // Track the first downloaded image for fallback
    const firstImageMatch = processedMarkdown.match(/!\[.*?\]\(([^)]+)\)/);
    if (firstImageMatch && !firstImageMatch[1].startsWith('http')) {
        firstBodyImagePath = firstImageMatch[1];
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

    // Generate and write markdown file
    const finalMarkdown = generateMarkdown(frontmatter, processedMarkdown);
    const markdownPath = path.join(config.OUTPUT.CONTENT_DIR, `${slug}.md`);
    await fs.writeFile(markdownPath, finalMarkdown, 'utf-8');

    // Count images that weren't downloaded (still have remote URLs)
    const remoteImageCount = countRemoteImages(finalMarkdown);
    if (remoteImageCount > 0) {
        console.warn(`   ⚠ ${remoteImageCount} images not downloaded (still remote URLs)`);
    }

    console.log(`   ✓ Created: ${markdownPath}`);

    return { slug, frontmatter, downloadedCount, remoteImageCount, nullFields };
}

/**
 * Build the URL list from config.URLS plus any <loc> entries in config.SITEMAP
 * SITEMAP: { url: "https://site.com/post-sitemap.xml", filter: (url) => true }
 */
async function getUrls() {
    const urls = [...(config.URLS || [])];

    if (config.SITEMAP?.url) {
        const xml = await getPageContent(config.SITEMAP.url);
        const locs = [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map(m => m[1]);
        const filter = config.SITEMAP.filter || (() => true);
        for (const loc of locs) {
            if (filter(loc) && !urls.includes(loc)) urls.push(loc);
        }
        console.log(`   Found ${locs.length} URLs in sitemap, using ${urls.length}`);
    }

    return urls;
}

/**
 * Main entry point
 */
async function init() {
    console.log('🚀 Blog Migrator');
    const urls = await getUrls();
    console.log(`   Processing ${urls.length} URLs`);
    console.log(`   Content output: ${config.OUTPUT.CONTENT_DIR}`);
    console.log(`   Images output: ${config.OUTPUT.IMAGES_DIR}`);

    const results = [];

    for (const url of urls) {
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
