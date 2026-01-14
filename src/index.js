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
 * Normalize image extension to .jpg (handles .jpg, .jpeg, .JPG, .JPEG, etc.)
 */
function normalizeImageExtension(extension) {
    const ext = extension.toLowerCase();
    // Convert any jpeg/jpg variant to .jpg
    if (ext === '.jpg' || ext === '.jpeg') {
        return '.jpg';
    }
    // For other image formats, keep as-is but lowercase
    return ext;
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

/**
 * Extract all data-image-url attributes from HTML
 * Returns array of unique URLs
 */
function extractDataImageUrls(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const elements = document.querySelectorAll('[data-image-url]');
    const urls = new Set();

    for (const element of elements) {
        const url = element.getAttribute('data-image-url');
        if (url && url.trim()) {
            urls.add(url.trim());
        }
    }

    return Array.from(urls);
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
 * Count remaining remote images in markdown (images that failed to download)
 */
function countRemoteImages(markdown) {
    const remoteImageRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
    const matches = markdown.match(remoteImageRegex);
    return matches ? matches.length : 0;
}

/**
 * Download data-image-url images to per-page folder with sequential naming
 * Returns { downloadedCount, failedCount, totalFound, folderPath }
 */
async function downloadDataImageUrls(urls, slug, baseOutputDir) {
    const folderPath = path.join(baseOutputDir, slug);
    await ensureDir(folderPath);

    let downloadedCount = 0;
    let failedCount = 0;
    let index = 1;

    for (const url of urls) {
        const extension = getExtensionFromUrl(url);
        const normalizedExtension = normalizeImageExtension(extension);
        const pattern = config.DATA_IMAGE_URL_MODE.filenamePattern || "{index}";
        const filename = pattern.replace('{index}', String(index).padStart(2, '0')) + normalizedExtension;
        const outputPath = path.join(folderPath, filename);

        const success = await downloadFile(url, outputPath);
        if (success) {
            downloadedCount++;
            index++;
        } else {
            failedCount++;
        }
    }

    return { downloadedCount, failedCount, totalFound: urls.length, folderPath };
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
            // Escape quotes and wrap in quotes if contains special chars
            if (value.includes(':') || value.includes('#') || value.includes('\n') || value.includes('"')) {
                yaml += `${key}: "${value.replace(/"/g, '\\"')}"\n`;
            } else {
                yaml += `${key}: ${value}\n`;
            }
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

    // Check if data-image-url mode is enabled
    const dataImageUrlMode = config.DATA_IMAGE_URL_MODE?.enabled === true;

    if (dataImageUrlMode) {
        // Data-image-url extraction mode
        const urls = extractDataImageUrls(html);
        console.log(`   Found ${urls.length} data-image-url attributes`);

        if (urls.length === 0) {
            console.warn(`   ⚠ No data-image-url attributes found on this page`);
            return { slug, downloadedCount: 0, failedCount: 0, totalFound: 0, folderPath: null, success: true };
        }

        const baseOutputDir = config.DATA_IMAGE_URL_MODE.baseOutputDir || "./downloads";
        const { downloadedCount, failedCount, totalFound, folderPath } = 
            await downloadDataImageUrls(urls, slug, baseOutputDir);

        console.log(`   ✓ Downloaded ${downloadedCount}/${totalFound} images to ${folderPath}`);
        if (failedCount > 0) {
            console.warn(`   ⚠ Failed to download ${failedCount} images`);
        }

        return { slug, downloadedCount, failedCount, totalFound, folderPath, success: true };
    } else {
        // Original blog migrator mode
        // Extract data (frontmatter, content HTML, and null fields)
        const { frontmatter, content, nullFields } = createPageDataObject(url, html);
        const featuredImage = extractFeaturedImage(html);

        // Create output directories
        await ensureDir(config.OUTPUT.CONTENT_DIR);
        await ensureDir(config.OUTPUT.IMAGES_DIR);

        // Step 1: Convert HTML to Markdown (no URL rewriting yet)
        const rawMarkdown = htmlToMarkdown(content);

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

        return { slug, frontmatter, downloadedCount, remoteImageCount, nullFields, success: true };
    }
}

/**
 * Main entry point
 */
async function init() {
    const dataImageUrlMode = config.DATA_IMAGE_URL_MODE?.enabled === true;

    if (dataImageUrlMode) {
        console.log('🚀 Data Image URL Extractor');
        console.log(`   Processing ${config.URLS.length} URLs`);
        console.log(`   Output directory: ${config.DATA_IMAGE_URL_MODE.baseOutputDir}`);
    } else {
        console.log('🚀 Blog Migrator');
        console.log(`   Processing ${config.URLS.length} URLs`);
        console.log(`   Content output: ${config.OUTPUT.CONTENT_DIR}`);
        console.log(`   Images output: ${config.OUTPUT.IMAGES_DIR}`);
    }

    const results = [];

    for (const url of config.URLS) {
        try {
            const result = await processUrl(url);
            results.push({ url, ...result });
        } catch (error) {
            console.error(`\n❌ Error processing ${url}:`, error.message);
            results.push({ url, success: false, error: error.message });
        }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));

    const successful = results.filter(r => r.success !== false);
    const failed = results.filter(r => r.success === false);

    if (dataImageUrlMode) {
        // Data-image-url mode summary
        const totalDownloaded = successful.reduce((sum, r) => sum + (r.downloadedCount || 0), 0);
        const totalFailed = successful.reduce((sum, r) => sum + (r.failedCount || 0), 0);
        const totalFound = successful.reduce((sum, r) => sum + (r.totalFound || 0), 0);

        console.log(`✓ Successful: ${successful.length}`);
        console.log(`✗ Failed: ${failed.length}`);
        console.log(`📷 Total images found: ${totalFound}`);
        console.log(`📥 Total images downloaded: ${totalDownloaded}`);
        if (totalFailed > 0) {
            console.log(`⚠ Total images failed: ${totalFailed}`);
        }

        // Per-page breakdown
        if (successful.length > 0) {
            console.log('\n' + '-'.repeat(50));
            console.log('📁 Per-page results:');
            for (const r of successful) {
                if (r.folderPath) {
                    console.log(`  - ${r.slug}: ${r.downloadedCount}/${r.totalFound} images → ${r.folderPath}`);
                    if (r.failedCount > 0) {
                        console.log(`    ⚠ ${r.failedCount} failed downloads`);
                    }
                } else {
                    console.log(`  - ${r.slug}: No images found`);
                }
            }
        }
    } else {
        // Blog migrator mode summary
        const withNulls = successful.filter(r => r.nullFields && r.nullFields.length > 0);
        const withRemoteImages = successful.filter(r => r.remoteImageCount > 0);
        const totalRemoteImages = withRemoteImages.reduce((sum, r) => sum + r.remoteImageCount, 0);
        const totalDownloaded = successful.reduce((sum, r) => sum + (r.downloadedCount || 0), 0);

        console.log(`✓ Successful: ${successful.length}`);
        console.log(`✗ Failed: ${failed.length}`);
        console.log(`📷 Total images downloaded: ${totalDownloaded}`);
        console.log(`⚠ Pages with missing fields: ${withNulls.length}`);
        console.log(`⚠ Pages with remote images: ${withRemoteImages.length} (${totalRemoteImages} images total)`);

        // Detailed breakdowns
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
    }

    // Failed URLs (common to both modes)
    if (failed.length > 0) {
        console.log('\n' + '-'.repeat(50));
        console.log('❌ Failed URLs:');
        for (const f of failed) {
            console.log(`  - ${f.url}: ${f.error}`);
        }
    }

    console.log('\n✅ Processing complete!');
}

init();
