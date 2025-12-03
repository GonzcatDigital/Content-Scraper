# Content Scraper

A Node.js CLI tool for migrating blog content from any website to static markdown files. It extracts content, frontmatter, and downloads all images with clean sequential naming.

Tutorial Video - https://www.loom.com/share/2d72a916da61460f8ca6c19e8608221c

## What It Does

- Scrapes a list of URLs you provide
- Extracts frontmatter data (title, description, date, author, etc.)
- Downloads and renames all images sequentially
- Converts HTML content to clean Markdown
- Outputs `.md` files ready for static site generators

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Your Source

Edit `src/config.js` to match the website you're scraping. See [Configuration](#configuration) below.

### 3. Run It

```bash
npm start
```

Your files will appear in the `downloads/` folder:

```
downloads/
├── content/
│   ├── my-first-post.md
│   └── my-second-post.md
└── images/
    ├── my-first-post-01.jpg
    ├── my-first-post-02.jpg
    ├── my-first-post-featured.jpg
    └── ...
```

---

## Configuration

All settings live in `src/config.js`. Here's what you need to configure:

### URLs to Scrape

```js
URLS: [
    "https://example.com/blog-post-1/",
    "https://example.com/blog-post-2/",
    // Add all the URLs you want to migrate
]
```

### Output Directories

```js
OUTPUT: {
    CONTENT_DIR: "./downloads/content",  // Where .md files go
    IMAGES_DIR: "./downloads/images",    // Where images go
}
```

### Frontmatter Data

The `DATA` object defines what goes in your frontmatter. Each key becomes a field name.

**Static values** (same for all posts):
```js
AUTHOR: "John Smith",
CATEGORY: "Blog",
```

**Dynamic values** (extracted from each page):
```js
TITLE: {
    selector: "h1",                           // CSS selector
    getValue: (el) => el.textContent.trim(),  // How to get the value
},
```

**The body content** (must have `isContent: true`):
```js
BODY: {
    selector: ".post-content",
    getValue: (el) => el.innerHTML,
    isContent: true,
}
```

---

## Finding the Right Selectors

The key to using this tool is finding the right CSS selectors for your target website.

### Step 1: Open DevTools

1. Go to one of your target blog posts in Chrome/Firefox
2. Right-click → "Inspect" (or press F12)

### Step 2: Find Your Elements

Click the selector icon (top-left of DevTools) then click on elements in the page:

| What you need | Where to look |
|---------------|---------------|
| **Title** | Usually an `<h1>` tag |
| **Content** | A `<div>` or `<article>` with a class like `.post-content`, `.entry-content`, `.article-body` |
| **Date** | Often in a `<meta>` tag: `meta[property='article:published_time']` |
| **Description** | Usually: `meta[name='description']` |
| **Featured image** | An `<img>` tag with a class, or a `<div>` with a background image |

### Step 3: Test in Console

Test your selectors in the browser console:

```js
document.querySelector("h1").textContent
document.querySelector(".post-content").innerHTML
document.querySelector("meta[name='description']").getAttribute("content")
```

---

## Image Handling

### Body Images (Automatic)

All images in your content are automatically:
1. Found in the markdown output
2. Downloaded to the images folder
3. Renamed to `{slug}-01.jpg`, `{slug}-02.jpg`, etc.
4. URLs rewritten to your `relativePath`

No configuration needed!

### Featured Image

The featured image is extracted separately. Configure it in `IMAGE_EXTRACTION.featuredImage`:

```js
featuredImage: {
    selector: ".featured-image img",          // Where to find it
    getValue: (el) => el.src,                 // How to get the URL
    altSelector: null,                        // Optional: different element for alt text
    getAlt: (el) => el?.alt || '',            // How to get alt text
    filenamePattern: "{slug}-featured",       // Output filename
    frontmatterKey: "image",                  // Frontmatter field name
    altFrontmatterKey: "imageAlt",            // Alt text field name
}
```

**Fallback**: If the featured image selector fails, the first body image is used automatically.

**Disable**: Set `featuredImage: null` to skip featured image extraction entirely.

### Filtering Images

Skip certain images with the filter function:

```js
filter: (url) => {
    if (url.includes('placeholder')) return false;  // Skip placeholders
    if (url.includes('ad-network.com')) return false;  // Skip ads
    return true;
}
```

---

## Common WordPress Selectors

Here are selectors that work for most WordPress sites:

```js
DATA: {
    TITLE: {
        selector: "h1.entry-title",
        getValue: (el) => el.textContent.trim(),
    },
    DESCRIPTION: {
        selector: "meta[name='description']",
        getValue: (el) => el.getAttribute("content"),
    },
    DATE: {
        selector: "meta[property='article:published_time']",
        getValue: (el) => el.getAttribute("content"),
    },
    BODY: {
        selector: ".entry-content",
        getValue: (el) => el.innerHTML,
        isContent: true,
    },
}
```

Featured image:
```js
featuredImage: {
    selector: ".wp-post-image",
    getValue: (el) => el.src,
    getAlt: (el) => el?.alt || '',
    // ... rest of config
}
```

---

## Handling Background Images

Some sites use CSS background images instead of `<img>` tags. Extract them like this:

```js
featuredImage: {
    selector: ".hero-image",
    getValue: (el) => el.style.backgroundImage.replace(/url\(['"]?/, '').replace(/['"]?\)/, ''),
    // ... rest of config
}
```

---

## Output Format

Each markdown file looks like this:

```markdown
---
title: My Blog Post Title
description: A description of the post
author: John Smith
date: 2024-01-15
category: Blog
image: /assets/uploads/my-blog-post-featured.jpg
imageAlt: Alt text for the image
---

Your content here with images:

![Image description](/assets/uploads/my-blog-post-01.jpg)

More content...
```

---

## Summary Report

After running, you'll see a summary like:

```
==================================================
📊 SUMMARY
==================================================
✓ Successful: 18
✗ Failed: 0
📷 Total images downloaded: 245
⚠ Pages with missing fields: 2
```

- **Successful**: Pages that processed without errors
- **Failed**: Pages that couldn't be fetched or processed
- **Images downloaded**: Total images saved
- **Missing fields**: Pages where some selectors returned null

---

## Troubleshooting

### "Failed to parse URL"
Your image URL extraction is returning something invalid. Check for extra characters:
```js
// Bad: includes CSS wrapper
getValue: (el) => el.style.backgroundImage  // Returns: url("https://...")

// Good: strips the wrapper
getValue: (el) => el.style.backgroundImage.replace(/url\(['"]?/, '').replace(/['"]?\)/, '')
```

### Selector returning null
Test your selector in the browser console first:
```js
document.querySelector(".your-selector")  // Should not be null
```

### Images not downloading
Check the console for errors. Common causes:
- Image returns 404
- Server blocks automated requests
- Use the `filter` function to skip problematic URLs

### Content looks wrong
The `BODY` selector might be too broad or narrow. Try a more specific selector that captures just the article content, not sidebars or comments.

---

## Limitations

- **Static HTML only**: JavaScript-rendered content won't be captured
- **Sequential processing**: URLs are processed one at a time
- **No retry logic**: Failed downloads are skipped

---

## License

ISC

