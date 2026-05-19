export default {
    // Base URL of the website you're scraping (informational only)
    BASE_URL: "https://deckgeekz.com",

    // List of URLs to scrape
    URLS: [
        "https://deckgeekz.com/blog/diy-vs--professional-deck-building--pros-and-cons",
        "https://deckgeekz.com/blog/5-innovative-deck-design-trends-to-elevate-your-backyard",
        "https://deckgeekz.com/blog/avoiding-common-deck-building-mistakes--insights-from-the-experts",
        "https://deckgeekz.com/blog/comparing-wood-decks-to-composite-options--what-s-best-for-you-",
        "https://deckgeekz.com/blog/top-5-questions-to-ask-your-local-deck-installation-experts",
        "https://deckgeekz.com/blog/a-local-s-guide-to-deck-friendly-landscaping-in-lake-county",
        "https://deckgeekz.com/blog/the-ultimate-guide-to-choosing-deck-builders-in-valparaiso--indiana",
        "https://deckgeekz.com/blog/gazebo-vs--pergola--which-is-right-for-your-indiana-home-",
        "https://deckgeekz.com/blog/diy-or-professional-deck-installation--making-the-right-choice",
        "https://deckgeekz.com/blog/the-ultimate-guide-to-choosing-the-right-deck-material-for-your-home",
        "https://deckgeekz.com/blog/expert-tips-for-choosing-the-right-deck-design",
        "https://deckgeekz.com/blog/financing-options-for-pool-and-deck-projects",
        "https://deckgeekz.com/blog/transform-your-backyard-with-a-stunning-pool-deck",
        "https://deckgeekz.com/blog/case-study--transforming-a-backyard-with-deck-geekz-llc",
        "https://deckgeekz.com/blog/diy-tips--how-to-maintain-your-wood-deck-like-a-pro",
        "https://deckgeekz.com/blog/how-to-choose-the-right-decking-material-for-your-indiana-home",
        "https://deckgeekz.com/blog/eco-friendly-decking-options--sustainable-choices-for-your-home",
        "https://deckgeekz.com/blog/diy-deck-maintenance--expert-tips-from-deck-geekz",
        "https://deckgeekz.com/blog/how-to-prepare-your-deck-for-midwest-winters",
        "https://deckgeekz.com/blog/summer-outdoor-space-upgrades-in-indiana--trends-and-tips",
        "https://deckgeekz.com/blog/diy-deck-maintenance-tips--keep-your-outdoor-space-looking-new",
        "https://deckgeekz.com/blog/the-geek-s-guide-to-building-the-perfect-deck-in-lake-county",
        "https://deckgeekz.com/blog/faq--common-deck-building-questions-answered-by-deck-geekz",
        "https://deckgeekz.com/blog/seasonal-deck-maintenance-tips-for-indiana-residents",
        "https://deckgeekz.com/blog/case-study--transforming-a-lake-county-backyard-into-an-outdoor-oasis",
        "https://deckgeekz.com/blog/case-study--transforming-lake-county-backyards-with-deck-geekz",
        "https://deckgeekz.com/blog/exploring-the-latest-trends-in-deck-design-and-material-science",
        "https://deckgeekz.com/blog/the-ultimate-guide-to-choosing-the-right-deck-builder-in-lake-county",
        "https://deckgeekz.com/blog/the-deck-geekz-difference--crafting-exceptional-decks",
        "https://deckgeekz.com/blog/the-science-behind-building-a-durable-deck--insights-from-deck-geekz",
        "https://deckgeekz.com/blog/the-ultimate-guide-to-building-wood-decks-in-lake-county",
        "https://deckgeekz.com/blog/deck-materials-101--what-works-best-in-northwest-indiana-",
        "https://deckgeekz.com/blog/exploring-material-options--choosing-the-best-for-your-custom-deck",
        "https://deckgeekz.com/blog/preparing-your-deck-for-winter-in-porter-county--indiana",
        "https://deckgeekz.com/blog/choosing-the-best-decking-material-for-your-northwest-indiana-home",
        "https://deckgeekz.com/blog/composite-vs--wood-decking--which-is-right-for-your-lake-county-home-",
        "https://deckgeekz.com/blog/designing-your-dream-deck--customization-options-with-deck-geekz",
        "https://deckgeekz.com/blog/why-choose-local-deck-installation-experts-in-lake-county",
        "https://deckgeekz.com/blog/transform-your-backyard--summer-outdoor-space-upgrades-in-indiana",
        "https://deckgeekz.com/blog/case-study--a-unique-deck-transformation-in-lake-county",
        "https://deckgeekz.com/blog/comparing-deck-building-companies-in-northwest-indiana--what-to-look-for",
        "https://deckgeekz.com/blog/preparing-your-deck-for-spring--maintenance-tips-for-northwest-indiana",
        "https://deckgeekz.com/blog/the-science-behind-composite-decking--why-it-s-perfect-for-lake-county-homes",
        "https://deckgeekz.com/blog/debunking-common-myths-about-deck-construction",
        "https://deckgeekz.com/blog/diy-vs--professional-deck-building--which-is-right-for-you-",
        "https://deckgeekz.com/blog/diy-vs--professional-deck-building--what-you-need-to-know",
        "https://deckgeekz.com/blog/diy-deck-maintenance-tips--keep-your-deck-looking-new"
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

        // Featured image - from og:image meta (direct URL, no Next.js wrapper)
        featuredImage: {
            selector: "meta[property='og:image']",
            getValue: (el) => el?.getAttribute("content") || '',
            altSelector: "title",
            getAlt: (el) => el?.textContent?.trim() || '',
            filenamePattern: "{slug}-featured",
            frontmatterKey: "image",
            altFrontmatterKey: "imageAlt",
        },
    },

    // Frontmatter & content data - Deck Geekz (Durable site)
    DATA: {
        AUTHOR: "Deck Geekz",

        TITLE: {
            selector: "title",
            getValue: (el) => el?.textContent?.trim() || '',
        },

        DESCRIPTION: {
            selector: "meta[name='description']",
            getValue: (el) => (el?.getAttribute("content") || '').replace(/\s+/g, ' ').trim(),
        },

        DATE: {
            selector: ".body-small span",
            getValue: (el) => el?.textContent?.trim() || '',
        },

        CATEGORY: "Blog",

        BODY: {
            selector: ".rich-text-block",
            getValue: (el) => el?.innerHTML || '',
            isContent: true,
        },
    },
}
