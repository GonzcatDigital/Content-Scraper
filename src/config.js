export default {
    // Base URL of the website you're scraping (informational only)
    BASE_URL: "https://www.aquaticartspoolnspa.com",

    // List of URLs to scrape
    URLS: [
        "https://www.aquaticartspoolnspa.com/freeform-pools",
        "https://www.aquaticartspoolnspa.com/geometric-pools",
        "https://www.aquaticartspoolnspa.com/small-pools",
        "https://www.aquaticartspoolnspa.com/natural-pools",
        "https://www.aquaticartspoolnspa.com/swimming-pool-features",
        "https://www.aquaticartspoolnspa.com/spas-hottubs",
    ],

    // Output directories (relative to project root)
    OUTPUT: {
        CONTENT_DIR: "./downloads/content",
        IMAGES_DIR: "./downloads/images",
    },

    // Image settings
    IMAGE_EXTRACTION: {
        // Path prefix for rewritten image URLs in markdown
        relativePath: "/assets/uploads/",
        // Filename pattern: {slug} and {index} are replaced
        filenamePattern: "{slug}-{index}",
        // Optional: filter function to skip certain URLs (return false to skip)
        filter: (url) => true,

        // Featured image - set to null to disable
        // Extracted separately, falls back to first body image if not found
        featuredImage: {
            // CSS selector to find the featured image element
            selector: ".featured-image img",
            // Function to extract the image URL from the element
            getValue: (el) => el.src,
            // Optional: use a different element for alt text
            altSelector: null,
            getAlt: (el) => el?.alt || '',
            // Filename pattern: {slug} is replaced
            filenamePattern: "{slug}-featured",
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
        AUTHOR: "Author Name",

        // Example: Extract from an element
        TITLE: {
            selector: "h1",
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
            selector: ".post-content",
            getValue: (el) => el.innerHTML,
            isContent: true,
        },
    },

    // Data-image-url extraction mode
    // When enabled, extracts images from data-image-url attributes instead of blog migration
    DATA_IMAGE_URL_MODE: {
        enabled: true,
        baseOutputDir: "./downloads",
        filenamePattern: "{index}", // Sequential: 01, 02, 03...
    }
}
