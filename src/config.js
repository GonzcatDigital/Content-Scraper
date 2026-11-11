// ─────────────────────────────────────────────────────────────────────────────
// PACT Plumbing blog migration
// Source: WordPress + Rank Math at https://www.pactplumbing.com (posts live at /articles/{slug}/)
// Target: PACT-Plumbing Eleventy repo (posts move to /blog/{slug}/)
// ─────────────────────────────────────────────────────────────────────────────

const SITE = "https://www.pactplumbing.com";

// Cities that had a hub page on the old site (/dallas/ etc.) but only have
// city + service pages on the new site
const CITY_HUBS = ["dallas", "fort-worth", "frisco", "grapevine", "keller", "mckinney", "plano", "roanoke", "southlake"];

// Posts about hydrostatic testing link city hubs to that city's hydrostatic page;
// everything else goes to the city's leak detection page
const HYDROSTATIC_POSTS = ["hydrostatic-test-cost-dfw", "hydrostatic-testing-dfw", "pre-purchase-plumbing-inspection-dfw"];

// Old-site paths that don't exist on the new site → closest new page
const PATH_REMAPS = {
    "/contact-us/": "/contact/",
    "/pipes-drains/": "/plumbing-service-repair/",
    "/hydrostatic-testing-cost-calculator/": "/hydrostatic-testing/",
};

export default {
    // Base URL of the website you're scraping (informational only)
    BASE_URL: SITE,

    // Extra URLs to scrape (added to anything found in SITEMAP)
    URLS: [],

    // Pull URLs from the WordPress/Rank Math post sitemap
    SITEMAP: {
        url: `${SITE}/post-sitemap.xml`,
        filter: (url) => url.includes("/articles/"),
    },

    // Output straight into the PACT-Plumbing repo
    OUTPUT: {
        CONTENT_DIR: "../PACT-Plumbing/src/content/blog",
        IMAGES_DIR: "../PACT-Plumbing/src/assets/images/blog",
    },

    // Image settings
    IMAGE_EXTRACTION: {
        relativePath: "/assets/images/blog/",
        filenamePattern: "{slug}-{index}",
        filter: (url) => true,

        // Rank Math puts the featured image in og:image
        featuredImage: {
            selector: "meta[property='og:image']",
            getValue: (el) => el.getAttribute("content"),
            altSelector: "meta[property='og:image:alt']",
            getAlt: (el) => el?.getAttribute("content") || "",
            filenamePattern: "{slug}",
            frontmatterKey: "image",
            altFrontmatterKey: "imageAlt",
        },
    },

    // Link rewriting - return the new href, or null to unlink (keeps the anchor text)
    LINKS: {
        rewrite: (href, slug) => {
            // Google Business share links (part of the old link-swap blocks)
            if (href.includes("share.google")) return null;

            // Only touch links to the old site
            if (!href.startsWith(SITE) && !href.startsWith("/")) return href;
            let path = href.replace(SITE, "") || "/";

            // Posts moved from /articles/ to /blog/
            path = path.replace(/^\/articles\//, "/blog/");

            if (PATH_REMAPS[path]) return PATH_REMAPS[path];

            const city = path.replace(/\//g, "");
            if (CITY_HUBS.includes(city)) {
                return HYDROSTATIC_POSTS.includes(slug) ? `/${city}-hydrostatic-testing/` : `/${city}-leak-detection/`;
            }

            return path;
        },
    },

    // Frontmatter & content data
    // Field names match the Decap CMS collection in PACT-Plumbing/src/admin/config.yml
    DATA: {
        // Rank Math meta title (used for <title>)
        TITLE: {
            selector: "title",
            getValue: (el) => el.textContent.trim(),
        },

        // On-page H1 (often different to the meta title)
        HEADING: {
            selector: "h1.entry-title",
            getValue: (el) => el.textContent.trim(),
        },

        DESCRIPTION: {
            selector: "meta[name='description']",
            getValue: (el) => el.getAttribute("content"),
        },

        // Slug used by blog.json to build /blog/{url}/
        URL: {
            selector: "link[rel='canonical']",
            getValue: (el) => new URL(el.getAttribute("href")).pathname.split("/").filter(Boolean).pop(),
        },

        AUTHOR: "Pact Plumbing",

        // YYYY-MM-DD
        DATE: {
            selector: "meta[property='article:published_time']",
            getValue: (el) => el.getAttribute("content").slice(0, 10),
        },

        BODY: {
            selector: ".entry-content",
            getValue: (el) => {
                // Inline JSON-LD (FAQ schema) and styles would otherwise turn into body text
                el.querySelectorAll("script, style").forEach((node) => node.remove());

                // Embedded Gravity Forms contact forms (the new site has its own contact page)
                el.querySelectorAll(".gform_wrapper, .gform_anchor, form, noscript").forEach((node) => node.remove());

                // Hidden background images inside WordPress "bne-container" blocks
                el.querySelectorAll("img[style*='display:none'], img[style*='display: none']").forEach((img) => img.remove());

                // "Trusted Local Network" link-swap sections: the heading plus everything up to the next heading
                el.querySelectorAll("h2, h3, h4").forEach((heading) => {
                    if (heading.textContent.trim() !== "Trusted Local Network") return;
                    let next = heading.nextElementSibling;
                    while (next && !/^H[1-4]$/.test(next.tagName)) {
                        const remove = next;
                        next = next.nextElementSibling;
                        remove.remove();
                    }
                    heading.remove();
                });

                return el.innerHTML;
            },
            isContent: true,
        },
    },
};
