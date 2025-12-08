import fs from 'fs/promises';
import path from 'path';

const CONTENT_DIR = './downloads/content';

// ============================================
// FRONTMATTER HELPERS
// ============================================

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content, rawFrontmatter: '' };
    
    const rawFrontmatter = match[1];
    const body = match[2];
    
    const frontmatter = {};
    const lines = rawFrontmatter.split('\n');
    
    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();
        
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        
        frontmatter[key] = value === 'null' ? null : value;
    }
    
    return { frontmatter, body, rawFrontmatter };
}

/**
 * Convert ISO date to simple YYYY-MM-DD format
 */
function cleanDate(dateStr) {
    if (!dateStr) return dateStr;
    
    // Match ISO format with timezone
    const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
        return match[1];
    }
    
    return dateStr;
}

/**
 * Update just the date in the raw frontmatter string
 */
function updateDateInFrontmatter(rawFrontmatter, newDate) {
    // Replace date line, preserving format but changing value
    return rawFrontmatter.replace(
        /^(date:\s*)["']?\d{4}-\d{2}-\d{2}[^"'\n]*["']?$/m,
        `$1${newDate}`
    );
}

// ============================================
// MARKDOWN STRUCTURE HELPERS
// ============================================

/**
 * Remove bold formatting from headings only
 */
function removeBoldFromHeadings(body) {
    // Match ## **Heading** and variations - only headings, not other content
    return body.replace(/^(#{2,6})\s*\*\*(.+?)\*\*\s*$/gm, '$1 $2');
}

// ============================================
// MAIN CLEANUP FUNCTION
// ============================================

/**
 * Clean a single markdown file - MINIMAL changes only
 */
function cleanMarkdownFile(content, filename) {
    const changes = [];
    
    // Parse frontmatter and body
    let { frontmatter, body, rawFrontmatter } = parseFrontmatter(content);
    
    // === FRONTMATTER: ONLY fix date format ===
    const originalDate = frontmatter.date;
    const newDate = cleanDate(frontmatter.date);
    
    if (newDate && newDate !== originalDate) {
        rawFrontmatter = updateDateInFrontmatter(rawFrontmatter, newDate);
        changes.push(`Date: Converted to YYYY-MM-DD format`);
    }
    
    // === BODY: ONLY remove bold from headings ===
    const bodyBeforeBold = body;
    body = removeBoldFromHeadings(body);
    if (body !== bodyBeforeBold) {
        changes.push(`Removed bold formatting from headings`);
    }
    
    // Rebuild content with original frontmatter structure (only date changed)
    const cleanedContent = '---\n' + rawFrontmatter + '\n---\n' + body;
    
    return { cleanedContent, changes };
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
    console.log('🧹 Starting markdown cleanup (minimal changes)...\n');
    console.log('Changes being made:');
    console.log('  ✓ Date format: YYYY-MM-DDTHH:MM:SS → YYYY-MM-DD');
    console.log('  ✓ Headings: ## **Bold** → ## Bold');
    console.log('  ✗ NOT touching: titles, descriptions, H1, imageAlt, null fields\n');
    
    // Get all markdown files
    const files = await fs.readdir(CONTENT_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort();
    
    console.log(`Found ${mdFiles.length} markdown files to process\n`);
    
    const summary = {
        totalFiles: mdFiles.length,
        filesWithChanges: 0,
        changeDetails: {}
    };
    
    for (let i = 0; i < mdFiles.length; i++) {
        const filename = mdFiles[i];
        const filepath = path.join(CONTENT_DIR, filename);
        
        console.log(`[${i + 1}/${mdFiles.length}] Processing: ${filename}`);
        
        try {
            // Read file
            const content = await fs.readFile(filepath, 'utf-8');
            
            // Clean content
            const { cleanedContent, changes } = cleanMarkdownFile(content, filename);
            
            // Track changes
            if (changes.length > 0) {
                summary.filesWithChanges++;
                summary.changeDetails[filename] = changes;
                console.log(`   ✓ ${changes.length} changes made`);
            } else {
                console.log(`   - No changes needed`);
            }
            
            // Write cleaned content
            await fs.writeFile(filepath, cleanedContent, 'utf-8');
            
        } catch (error) {
            console.error(`   ✗ Error: ${error.message}`);
        }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total files processed: ${summary.totalFiles}`);
    console.log(`Files with changes: ${summary.filesWithChanges}`);
    
    console.log('\n✅ Cleanup complete!');
}

main().catch(console.error);
