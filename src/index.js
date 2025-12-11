import config from "./config.js";
import { JSDOM } from "jsdom";
import fs from "fs/promises";
import path from "path";
import TurndownService from "turndown";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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
 * Get unique filename by appending -2, -3, etc. if file already exists
 */
async function getUniqueFilename(dirPath, baseFilename) {
    let filename = baseFilename;
    let counter = 1;
    const fullPath = path.join(dirPath, filename);
    
    try {
        await fs.access(fullPath);
        // File exists, need to make it unique
        const ext = path.extname(baseFilename);
        const nameWithoutExt = path.basename(baseFilename, ext);
        
        do {
            counter++;
            filename = `${nameWithoutExt}-${counter}${ext}`;
            const testPath = path.join(dirPath, filename);
            try {
                await fs.access(testPath);
                // This one also exists, try next
            } catch {
                // This filename is available
                break;
            }
        } while (true);
    } catch {
        // File doesn't exist, use original filename
    }
    
    return filename;
}

/**
 * Rename file and update permalink in frontmatter
 * Returns { newPath, updatedFrontmatter }
 */
async function renameFileAndUpdatePermalink(outputPath, oldSlug, newFilename, newPermalink, frontmatter) {
    try {
        // Read the current file content
        const fileContent = await fs.readFile(outputPath, 'utf-8');
        
        // Update frontmatter with new permalink
        const updatedFrontmatter = { ...frontmatter };
        updatedFrontmatter.permalink = newPermalink;
        
        // Regenerate the markdown with updated frontmatter
        // Extract the body content (everything after the frontmatter)
        const frontmatterEnd = fileContent.indexOf('---', 3); // Find second ---
        const bodyContent = fileContent.substring(frontmatterEnd + 3).trim();
        const updatedContent = generateMarkdown(updatedFrontmatter, bodyContent);
        
        // Generate new filename and path
        const newFilenameWithExt = `${newFilename}.html`;
        const newPath = path.join(path.dirname(outputPath), newFilenameWithExt);
        
        // Write updated content to new file
        await fs.writeFile(newPath, updatedContent, 'utf-8');
        
        // Delete old file
        await fs.unlink(outputPath);
        
        return { newPath, updatedFrontmatter };
    } catch (error) {
        console.warn(`   ⚠ Failed to rename file: ${error.message}`);
        throw error;
    }
}

/**
 * Open URL in Safari browser
 */
async function openInBrowser(url) {
    try {
        const platform = process.platform;
        let command;

        if (platform === 'darwin') {
            // macOS - use Safari
            command = `open -a "Safari" "${url}"`;
        } else if (platform === 'linux') {
            // Linux - fallback to default browser
            command = `xdg-open "${url}"`;
        } else if (platform === 'win32') {
            // Windows - fallback to default browser
            command = `start "" "${url}"`;
        } else {
            console.warn(`  ⚠ Unsupported platform for opening browser: ${platform}`);
            return;
        }

        await execAsync(command);
    } catch (error) {
        console.warn(`  ⚠ Failed to open Safari: ${error.message}`);
    }
}

/**
 * Construct localhost URL from original URL
 */
function getLocalhostUrl(originalUrl) {
    try {
        const urlObj = new URL(originalUrl);
        const pathname = urlObj.pathname;
        return `http://localhost:8080${pathname}`;
    } catch (error) {
        console.warn(`  ⚠ Failed to construct localhost URL: ${error.message}`);
        return null;
    }
}

/**
 * Download a file from URL and save to disk
 * Returns { success: boolean, contentType?: string }
 */
async function downloadFile(url, outputPath) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`  ⚠ Failed to download: ${url} (${response.status})`);
            return { success: false };
        }
        const contentType = response.headers.get('content-type') || null;
        const buffer = await response.arrayBuffer();
        await fs.writeFile(outputPath, Buffer.from(buffer));
        return { success: true, contentType };
    } catch (error) {
        console.warn(`  ⚠ Error downloading ${url}: ${error.message}`);
        return { success: false };
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
 * Get file extension from MIME type
 * Maps common image MIME types to file extensions
 */
function getExtensionFromMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
        return null;
    }

    // Normalize MIME type (remove parameters like charset)
    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();

    const mimeToExt = {
        'image/webp': '.webp',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/svg+xml': '.svg',
        'image/svg': '.svg',
        'image/avif': '.avif',
        'image/bmp': '.bmp',
        'image/x-icon': '.ico',
        'image/vnd.microsoft.icon': '.ico',
    };

    return mimeToExt[normalizedMime] || null;
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
 * Extract dimensions from URL (filename patterns, query params, path patterns)
 * Returns { width, height } or null if not found
 */
function extractSizeFromUrl(url) {
    if (!url) return null;

    // Try filename patterns: image-700x246.jpg, image_700x246.jpg, image.700x246.jpg
    const filenamePatterns = [
        /[_-](\d+)x(\d+)[._-]/i,  // image-700x246.jpg or image_700x246.jpg
        /\.(\d+)x(\d+)\./i,        // image.700x246.jpg
        /[_-](\d+)x(\d+)$/i,       // image-700x246 (at end, before extension)
    ];

    for (const pattern of filenamePatterns) {
        const match = url.match(pattern);
        if (match) {
            const width = parseInt(match[1], 10);
            const height = parseInt(match[2], 10);
            if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
                return { width, height };
            }
        }
    }

    // Try query parameters: ?w=700&h=246 or ?width=700&height=246
    try {
        const urlObj = new URL(url, 'http://dummy.com'); // base URL needed for relative URLs
        const width = urlObj.searchParams.get('w') || urlObj.searchParams.get('width');
        const height = urlObj.searchParams.get('h') || urlObj.searchParams.get('height');
        if (width && height) {
            const w = parseInt(width, 10);
            const h = parseInt(height, 10);
            if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
                return { width: w, height: h };
            }
        }
    } catch (e) {
        // URL parsing failed, continue
    }

    // Try path patterns: /700x246/ in path
    const pathPattern = /\/(\d+)x(\d+)\//i;
    const pathMatch = url.match(pathPattern);
    if (pathMatch) {
        const width = parseInt(pathMatch[1], 10);
        const height = parseInt(pathMatch[2], 10);
        if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
            return { width, height };
        }
    }

    return null;
}

/**
 * Extract the largest URL from a srcset attribute based on width descriptor
 * srcset format: "url1 300w, url2 600w, url3 1200w" or "url1, url2, url3"
 * Converts relative URLs to absolute using baseUrl
 * Returns the URL with the largest width value, or null if srcset is invalid/empty
 * Falls back to extracting size from URLs if no width descriptors are found
 */
function getLargestUrlFromSrcset(srcset, baseUrl) {
    if (!srcset || typeof srcset !== 'string') {
        return null;
    }

    // Debug: Log input
    console.log(`  🔍 Parsing srcset: ${srcset.substring(0, 100)}${srcset.length > 100 ? '...' : ''}`);

    // Split by comma to get individual entries
    const entries = srcset.split(',').map(entry => entry.trim());
    
    if (entries.length === 0) {
        console.log(`  ⚠ No entries found in srcset`);
        return null;
    }

    let largestEntry = null;
    let maxWidth = -1;
    let extractionMethod = 'none';
    const entryDetails = [];

    // Parse all entries to find the one with the largest width
    for (const entry of entries) {
        // Split entry into URL and descriptor parts
        const parts = entry.split(/\s+/);
        const url = parts[0].trim();
        
        if (!url) continue;

        let width = -1;
        let method = 'none';

        // Method 1: Look for width descriptor (e.g., "300w", "512w")
        for (let i = 1; i < parts.length; i++) {
            const descriptor = parts[i].trim();
            // Check if descriptor ends with 'w' (width descriptor)
            if (descriptor.endsWith('w')) {
                const widthValue = parseInt(descriptor.slice(0, -1), 10);
                if (!isNaN(widthValue) && widthValue > 0) {
                    width = widthValue;
                    method = 'width-descriptor';
                    break;
                }
            }
        }

        // Method 2: If no width descriptor, try extracting from URL
        if (width === -1) {
            const sizeInfo = extractSizeFromUrl(url);
            if (sizeInfo) {
                width = sizeInfo.width;
                method = 'url-extraction';
            }
        }

        entryDetails.push({ url, width, method });

        // If this entry has a larger width, update our candidate
        if (width > maxWidth) {
            maxWidth = width;
            largestEntry = url;
            extractionMethod = method;
        }
    }

    // Debug: Log what we found
    console.log(`  📊 Found ${entries.length} entries:`);
    entryDetails.forEach((detail, idx) => {
        const widthStr = detail.width > 0 ? `${detail.width}px (${detail.method})` : 'no size';
        console.log(`    ${idx + 1}. ${detail.url.substring(0, 60)}${detail.url.length > 60 ? '...' : ''} - ${widthStr}`);
    });

    // If no width information was found anywhere, fall back to last entry
    if (maxWidth === -1) {
        console.log(`  ⚠ No size information found, falling back to last entry`);
        const lastEntry = entries[entries.length - 1];
        largestEntry = lastEntry.split(/\s+/)[0].trim();
        extractionMethod = 'fallback-last';
    } else {
        console.log(`  ✅ Selected largest: ${maxWidth}px (method: ${extractionMethod})`);
    }

    if (!largestEntry) {
        console.log(`  ❌ No valid entry found`);
        return null;
    }
    
    // Convert to absolute URL if needed
    let finalUrl = largestEntry;
    if (!largestEntry.startsWith('http://') && !largestEntry.startsWith('https://')) {
        // If URL is relative and we have a baseUrl, convert to absolute
        if (baseUrl) {
            try {
                // Use URL constructor to resolve relative URL against baseUrl
                finalUrl = new URL(largestEntry, baseUrl).href;
            } catch (error) {
                // If URL construction fails, return null
                console.log(`  ❌ Failed to convert relative URL: ${error.message}`);
                return null;
            }
        }
    }

    console.log(`  🎯 Final URL: ${finalUrl.substring(0, 80)}${finalUrl.length > 80 ? '...' : ''}`);
    return finalUrl;
}

/**
 * Read template file and replace placeholders with actual content
 * @param {string} title - Title to replace {{TITLE}} placeholder
 * @param {string} content - Content to replace {{CONTENT}} placeholder
 * @param {string} schemaScript - Schema script content to replace {{SCHEMA_SCRIPT}} placeholder
 * @param {string} bannerAlt - Alt text to replace {{BANNER_ALT}} placeholder
 * @returns {Promise<string>} Processed template content
 */
async function processTemplate(title, content, schemaScript = '', bannerAlt = '') {
    try {
        const templatePath = path.join(process.cwd(), 'src', 'template.html');
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        
        // Indent schema script content (4 spaces to match script tag indentation)
        let indentedSchemaScript = '';
        if (schemaScript) {
            indentedSchemaScript = schemaScript
                .split('\n')
                .map(line => line ? '    ' + line : line)
                .join('\n');
        }
        
        // Replace placeholders
        let processed = templateContent.replace(/\{\{TITLE\}\}/g, title || '');
        processed = processed.replace(/\{\{CONTENT\}\}/g, content || '');
        processed = processed.replace(/\{\{SCHEMA_SCRIPT\}\}/g, indentedSchemaScript);
        processed = processed.replace(/\{\{BANNER_ALT\}\}/g, bannerAlt || '');
        
        return processed;
    } catch (error) {
        console.warn(`  ⚠ Error reading template file: ${error.message}`);
        // Fallback: return content without template wrapper
        return content;
    }
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
        // Priority 1: Check nitro-lazy-srcset first - extract largest URL
        const nitroSrcset = img.getAttribute('nitro-lazy-srcset');
        if (nitroSrcset) {
            const srcsetUrl = getLargestUrlFromSrcset(nitroSrcset, baseUrl);
            if (srcsetUrl) {
                img.setAttribute('src', srcsetUrl);
                continue; // Use nitro-lazy-srcset URL, skip other checks
            }
        }

        // Priority 2: Check regular srcset - extract largest URL
        const srcset = img.getAttribute('srcset');
        if (srcset) {
            const srcsetUrl = getLargestUrlFromSrcset(srcset, baseUrl);
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

    // Unwrap images from wrapper elements (h2, p, div)
    // Process multiple passes to handle nested wrappers like <div><p><img></p></div>
    let changed = true;
    while (changed) {
        changed = false;

        // Unwrap images from h2 tags (h2 containing only an img)
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
            const img = h2.querySelector('img');
            if (img && h2.children.length === 1 && h2.textContent.trim() === '') {
                h2.replaceWith(img);
                changed = true;
            }
        }

        // Unwrap images from p tags (p containing only an img)
        const paragraphs = document.querySelectorAll('p');
        for (const p of paragraphs) {
            const img = p.querySelector('img');
            if (img && p.children.length === 1 && p.textContent.trim() === '') {
                p.replaceWith(img);
                changed = true;
            }
        }

        // Unwrap ALL div tags (replace div with its contents)
        const divs = document.querySelectorAll('div');
        for (const div of divs) {
            // Replace div with its child nodes (unwrap it)
            div.replaceWith(...div.childNodes);
            changed = true;
        }
    }

    // Remove empty paragraphs (containing only whitespace or &nbsp;)
    const remainingParagraphs = document.querySelectorAll('p');
    for (const p of remainingParagraphs) {
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

        // Priority 1: Check nitro-lazy-srcset first - extract largest URL
        const nitroSrcset = img.getAttribute('nitro-lazy-srcset');
        if (nitroSrcset) {
            const srcsetUrl = getLargestUrlFromSrcset(nitroSrcset, baseUrl);
            if (srcsetUrl) {
                url = srcsetUrl;
            }
        }

        // Priority 2: Check regular srcset - extract largest URL
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
            const srcset = img.getAttribute('srcset');
            if (srcset) {
                const srcsetUrl = getLargestUrlFromSrcset(srcset, baseUrl);
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
 * Get Content-Type from URL via HEAD request
 * Returns content type string or null
 */
async function getContentType(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok) {
            return response.headers.get('content-type');
        }
    } catch (error) {
        // If HEAD fails, we'll fall back to URL extension
    }
    return null;
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
        // Try to get Content-Type to determine correct extension
        let extension = null;
        const contentType = await getContentType(url);
        if (contentType) {
            extension = getExtensionFromMimeType(contentType);
        }
        
        // Fall back to URL extension if Content-Type didn't give us one
        if (!extension) {
            extension = getExtensionFromUrl(url);
        }

        const pattern = config.IMAGE_EXTRACTION.filenamePattern || "{slug}-{index}";
        const filename = generateImageFilename(pattern, slug, index, extension);
        const outputPath = path.join(config.OUTPUT.IMAGES_DIR, filename);
        const localPath = `${config.IMAGE_EXTRACTION.relativePath}${filename}`;

        const downloadResult = await downloadFile(url, outputPath);
        if (downloadResult.success) {
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
            // Try to get Content-Type to determine correct extension
            let extension = null;
            const contentType = await getContentType(featuredImage.url);
            if (contentType) {
                extension = getExtensionFromMimeType(contentType);
            }
            
            // Fall back to URL extension if Content-Type didn't give us one
            if (!extension) {
                extension = getExtensionFromUrl(featuredImage.url);
            }

            const pattern = featuredConfig.filenamePattern || "{slug}-featured";
            const filename = pattern.replace('{slug}', slug) + extension;
            const outputPath = path.join(config.OUTPUT.IMAGES_DIR, filename);

            const downloadResult = await downloadFile(featuredImage.url, outputPath);
            if (downloadResult.success) {
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
    let schemaScript = '';
    let contentWithoutScripts = processedContent;
    if (isHtml) {
        const scriptRegex = /<script[\s\S]*?<\/script>/gi;
        const scriptMatches = processedContent.match(scriptRegex) || [];
        
        // Separate schema scripts from other scripts
        const otherScripts = [];
        
        for (const script of scriptMatches) {
            // Check if this is a schema script (type="application/ld+json")
            if (/type=["']application\/ld\+json["']/i.test(script)) {
                // Extract the content inside the schema script tag
                const contentMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
                if (contentMatch && contentMatch[1]) {
                    schemaScript = contentMatch[1].trim();
                }
            } else {
                otherScripts.push(script);
            }
        }
        
        scripts = otherScripts.join('\n');
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
        // Indent all content by 12 spaces (3 levels: section > cs-container > cs-content > content)
        const indentedContent = (h1Html + contentWithoutScripts)
            .split('\n')
            .map(line => line ? '            ' + line : line)
            .join('\n');
        wrappedContent = `<div class="cs-content">\n${indentedContent}\n</div>\n${scripts}`;
    } else {
        wrappedContent = processedContent;
    }

    // Get h1 text for banner (banner uses h1, not page title)
    const pageTitle = h1Text || '';

    // Process template with title, content, and schema script (only for HTML)
    let finalBodyContent = wrappedContent;
    if (isHtml) {
        finalBodyContent = await processTemplate(pageTitle, wrappedContent, schemaScript, h1Text);
    }

    // Generate and write output file
    const finalContent = generateMarkdown(frontmatter, finalBodyContent);
    const baseFilename = `${slug}.html`;
    const uniqueFilename = await getUniqueFilename(config.OUTPUT.CONTENT_DIR, baseFilename);
    const outputPath = path.join(config.OUTPUT.CONTENT_DIR, uniqueFilename);
    await fs.writeFile(outputPath, finalContent, 'utf-8');

    if (uniqueFilename !== baseFilename) {
        console.log(`   ℹ File already exists, using: ${uniqueFilename}`);
    }

    // Count images that weren't downloaded (still have remote URLs)
    const remoteImageCount = countRemoteImages(processedContent, isHtml);
    if (remoteImageCount > 0) {
        console.warn(`   ⚠ ${remoteImageCount} images not downloaded (still remote URLs)`);
    }

    console.log(`   ✓ Created: ${outputPath}`);

    // Check for rename mapping
    let finalSlug = slug;
    let finalPermalink = frontmatter.permalink;
    let finalOutputPath = outputPath;
    
    // Use permalink for rename lookup (matches RENAMES key format)
    const renameKey = frontmatter.permalink ? frontmatter.permalink.replace(/\/$/, '') : slug;
    if (config.RENAMES && config.RENAMES[renameKey]) {
        const renameMapping = config.RENAMES[renameKey];
        const newFilename = renameMapping.filename;
        const newPermalink = renameMapping.permalink;
        
        console.log(`   🔄 Renaming file and updating permalink...`);
        console.log(`      Original: ${slug}.html -> ${newFilename}.html`);
        console.log(`      Permalink: ${frontmatter.permalink} -> ${newPermalink}`);
        
        try {
            const renameResult = await renameFileAndUpdatePermalink(
                outputPath,
                slug,
                newFilename,
                newPermalink,
                frontmatter
            );
            
            finalSlug = newFilename;
            finalPermalink = newPermalink;
            finalOutputPath = renameResult.newPath;
            frontmatter = renameResult.updatedFrontmatter;
            
            console.log(`   ✓ Renamed to: ${finalOutputPath}`);
        } catch (error) {
            console.warn(`   ⚠ Rename failed, using original file: ${error.message}`);
        }
    }

    // Open URLs in Safari
    console.log(`   🌐 Opening URLs in Safari...`);
    await openInBrowser(url);
    
    // Construct localhost URL using new permalink if renamed, otherwise use original pathname
    let localhostUrl;
    if (config.RENAMES && config.RENAMES[renameKey]) {
        // Use the new permalink for localhost URL
        // Ensure permalink has leading slash
        const permalinkPath = finalPermalink.startsWith('/') ? finalPermalink : `/${finalPermalink}`;
        localhostUrl = `http://localhost:8080${permalinkPath}`;
    } else {
        // Use original URL pathname
        localhostUrl = getLocalhostUrl(url);
    }
    
    if (localhostUrl) {
        await openInBrowser(localhostUrl);
        console.log(`   ✓ Opened: ${url}`);
        console.log(`   ✓ Opened: ${localhostUrl}`);
    }

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
