export default {
    // Base URL of the website you're scraping (informational only)
    BASE_URL: "https://phxinjurylaw.com",

    // List of URLs to scrape
    URLS: [
        "https://phxinjurylaw.com/faq/a-drunk-driver-hit-me-in-an-auto-accident-how-does-that-affect-my-case/",
        "https://phxinjurylaw.com/faq/ambulance-took-me-from-the-crash-scene-who-pays-the-bill/",
    ],

    // Output directories (relative to project root)
    OUTPUT: {
        CONTENT_DIR: "./downloads/content",
        IMAGES_DIR: "./downloads/images",
    },

    // Image settings
    IMAGE_EXTRACTION: {
        // Path prefix for rewritten image URLs in markdown
        relativePath: "/assets/images/blog/",
        // Filename pattern: {slug} and {index} are replaced
        filenamePattern: "{slug}-{index}",
        // Optional: filter function to skip certain URLs (return false to skip)
        filter: (url) => true,

        // Featured image - set to null to disable
        // Extracted separately, falls back to first body image if not found
        featuredImage: {
            // CSS selector to find the featured image element
            selector: ".pageRow",
            // Function to extract the image URL from the element
            getValue: (el) => el.style.backgroundImage.replace(/url\(['"]?/, '').replace(/['"]?\)/, ''),
            // Optional: use a different element for alt text
            altSelector: ".vcex-page-title__text",
            getAlt: (el) => el?.textContent?.trim() || '',
            // Filename pattern: {slug} is replaced
            filenamePattern: "{slug}",
            // Frontmatter field names for the image
            frontmatterKey: "image",
            altFrontmatterKey: "imageAlt",
        },
    },

    // Frontmatter & content data
    // - Keys become lowercase frontmatter field names (underscores removed)
    // - String values are used directly as static values
    // - Objects with selector/getValue extract data from the page
    // - isContent: true → used as markdown body instead of frontmatter
    DATA: {
        // Example: Static value (same for all posts)
        AUTHOR: "Phoenix Accident and Injury Law Firm",

        // Example: Extract from an element
        TITLE: {
            selector: "title",
            getValue: (el) => el.textContent.trim(),
        },

        // Example: Extract from a meta tag
        DESCRIPTION: {
            selector: "meta[name='description']",
            getValue: (el) => el.getAttribute("content"),
        },

        // Example: Extract and format a date
        DATE: {
            selector: "meta[property='article:published_time']",
            getValue: (el) => el.getAttribute("content"),
        },

        // Example: Static category
        CATEGORY: "Blog",

        // The main content - must have isContent: true
        BODY: {
            selector: ".mainContentWrapper",
            getValue: (el) => el.innerHTML,
            isContent: true,
        },
    }
}
