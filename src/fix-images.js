import fs from 'fs/promises';
import path from 'path';

const IMAGES_DIR = './downloads/images';
const BROKEN_IMAGES_FILE = './broken-images.txt';
const BASE_URL = 'https://phxinjurylaw.com/blog/';

// TEST MODE: Set to a number to limit URLs processed, or null for all
const TEST_LIMIT = null;

/**
 * Extract featured image URL from page HTML
 * Finds the first background-image url that is a jpg/jpeg/png
 * Also checks nitro-lazy-bg attribute (NitroPack lazy loading)
 */
function extractFeaturedImageUrl(html) {
    // Patterns to check (in order of priority):
    // 1. nitro-lazy-bg attribute (NitroPack lazy loading)
    // 2. background-image in style with &quot; encoding
    // 3. background-image in style with regular quotes
    const patterns = [
        /nitro-lazy-bg="([^"]+\.(jpe?g|png))"/gi,
        /background-image:\s*url\(&quot;([^&]+\.(jpe?g|png))&quot;\)/gi,
        /background-image:\s*url\(['"]?([^'")\s!]+\.(jpe?g|png))['"]?\)/gi,
    ];
    
    for (const regex of patterns) {
        const match = regex.exec(html);
        if (match) {
            let url = match[1];
            
            // Clean NitroPack CDN URLs - extract original path
            const nitroMatch = url.match(/phxinjurylaw\.com\/nitropack_static\/.*?\/phxinjurylaw\.com(\/wp-content\/.+)/);
            if (nitroMatch) {
                url = 'https://phxinjurylaw.com' + nitroMatch[1];
            }
            
            return url;
        }
    }
    
    return null;
}

/**
 * Download image from URL
 */
async function downloadImage(imageUrl, outputPath) {
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(buffer));
    
    return buffer.byteLength;
}

/**
 * Get proper file extension from URL or content-type
 */
function getExtensionFromUrl(url) {
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        return ext === '.jpeg' ? '.jpg' : ext;
    }
    return '.jpg'; // default
}

async function main() {
    console.log('🔧 Fix Broken Images\n');
    console.log('Reading broken images list...');
    
    // Read broken images list
    const brokenImagesContent = await fs.readFile(BROKEN_IMAGES_FILE, 'utf-8');
    let brokenImages = brokenImagesContent.trim().split('\n').filter(Boolean);
    
    if (TEST_LIMIT) {
        console.log(`⚠️  TEST MODE: Processing only ${TEST_LIMIT} of ${brokenImages.length} images\n`);
        brokenImages = brokenImages.slice(0, TEST_LIMIT);
    } else {
        console.log(`Found ${brokenImages.length} broken images to fix\n`);
    }
    
    const results = {
        fixed: [],
        failed: [],
        noImage: []
    };
    
    for (let i = 0; i < brokenImages.length; i++) {
        const filename = brokenImages[i];
        const slug = path.basename(filename, path.extname(filename));
        const url = `${BASE_URL}${slug}/`;
        
        console.log(`[${i + 1}/${brokenImages.length}] ${slug}`);
        
        try {
            // Fetch the page
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const html = await response.text();
            
            // Extract featured image URL
            const imageUrl = extractFeaturedImageUrl(html);
            
            if (!imageUrl) {
                console.log(`   ⚠ No featured image found`);
                results.noImage.push(slug);
                continue;
            }
            
            console.log(`   Found: ${imageUrl.substring(0, 60)}...`);
            
            // Determine output filename with correct extension
            const ext = getExtensionFromUrl(imageUrl);
            const outputFilename = `${slug}${ext}`;
            const outputPath = path.join(IMAGES_DIR, outputFilename);
            
            // Delete old broken image if exists
            const oldPath = path.join(IMAGES_DIR, filename);
            try {
                await fs.unlink(oldPath);
            } catch (e) {
                // File might not exist, that's ok
            }
            
            // Download the image
            const size = await downloadImage(imageUrl, outputPath);
            console.log(`   ✓ Downloaded ${outputFilename} (${(size / 1024).toFixed(1)} KB)`);
            
            results.fixed.push({ slug, filename: outputFilename, size });
            
        } catch (error) {
            console.log(`   ✗ Error: ${error.message}`);
            results.failed.push({ slug, error: error.message });
        }
        
        // Small delay to be nice to the server
        await new Promise(r => setTimeout(r, 100));
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));
    console.log(`Fixed: ${results.fixed.length}`);
    console.log(`No image found: ${results.noImage.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    if (results.noImage.length > 0) {
        console.log('\n⚠ Pages with no featured image:');
        results.noImage.forEach(slug => console.log(`   - ${slug}`));
    }
    
    if (results.failed.length > 0) {
        console.log('\n✗ Failed:');
        results.failed.forEach(({ slug, error }) => console.log(`   - ${slug}: ${error}`));
    }
}

main().catch(console.error);
