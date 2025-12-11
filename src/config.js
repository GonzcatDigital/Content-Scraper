export default {
    // Base URL of the website you're scraping (informational only)
    BASE_URL: "https://phxinjurylaw.com",

    // List of URLs to scrape
    
    URLS: [
        "https://phxinjurylaw.com/best-online-attorney-services-in-phoenix/",
    ],

    // Rename mappings: maps original slug to { filename: newSlug, permalink: newPermalink }
    // Original slug is used to identify the file
    // filename is used for the new file name
    // permalink is used to update the permalink field in frontmatter
    RENAMES: {
        "tempe-personal-injury-lawyer": {
            filename: "tempe",
            permalink: "tempe/"
        },
        "tempe-car-accident-lawyer": {
            filename: "car-accident-lawyer",
            permalink: "tempe/car-accident-lawyer/"
        },
    },

    // Output directories (relative to project root)
    OUTPUT: {
        CONTENT_DIR: "./downloads/content",
        IMAGES_DIR: "./downloads/images",
    },

    // Image settings
    IMAGE_EXTRACTION: {
        // Path prefix for rewritten image URLs in markdown
        relativePath: "/assets/images/calculator/",
        // Filename pattern: {slug} and {index} are replaced
        filenamePattern: "{slug}-{index}",
        // Optional: filter function to skip certain URLs (return false to skip)
        filter: (url) => true,

        // Featured image - disabled for interior pages
        featuredImage: null,
    },

    // Frontmatter & content data
    // - Keys become lowercase frontmatter field names (underscores removed)
    // - String values are used directly as static values
    // - Objects with selector/getValue extract data from the page
    // - isContent: true → used as markdown body instead of frontmatter
    DATA: {
        TITLE: {
            selector: "title",
            getValue: (el) => el.textContent.trim(),
        },

        DESCRIPTION: {
            selector: "meta[name='description']",
            getValue: (el) => el.getAttribute("content"),
        },

        PERMALINK: {
            fromUrl: true,
            getValue: (url) => {
                const urlObj = new URL(url);
                return urlObj.pathname.replace(/^\//, ''); // Remove leading slash
            },
        },

        // The main content - must have isContent: true
        BODY: {
            selector: ".vcex-post-content-c",
            getValue: (el) => el.innerHTML,
            isContent: true,
            isHtml: true,  // Keep as HTML, don't convert to Markdown
        },
    }
}
