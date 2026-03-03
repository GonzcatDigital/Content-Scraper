export default {
    BASE_URL: "https://nursingabuseinjurylaw.com",

    URLS: [
        "https://nursingabuseinjurylaw.com/glossary/72-hour-fall-watch/",
        "https://nursingabuseinjurylaw.com/glossary/24-hour-sheets/",
        "https://nursingabuseinjurylaw.com/glossary/albumin-levels/",
        "https://nursingabuseinjurylaw.com/glossary/adult-day-care-abuse/",
        "https://nursingabuseinjurylaw.com/glossary/abuse/",
        "https://nursingabuseinjurylaw.com/glossary/braden-score/",
        "https://nursingabuseinjurylaw.com/glossary/bed-alarm/",
        "https://nursingabuseinjurylaw.com/glossary/bed-transfer-injuries/",
        "https://nursingabuseinjurylaw.com/glossary/bed-sores/",
        "https://nursingabuseinjurylaw.com/glossary/coumadin-toxicity/",
        "https://nursingabuseinjurylaw.com/glossary/c-diff-infection/",
        "https://nursingabuseinjurylaw.com/glossary/elderly-self-neglect/",
        "https://nursingabuseinjurylaw.com/glossary/elder-malnutrition/",
        "https://nursingabuseinjurylaw.com/glossary/elder-abuse/",
        "https://nursingabuseinjurylaw.com/glossary/elder-neglect/",
        "https://nursingabuseinjurylaw.com/glossary/emotional-abuse/",
        "https://nursingabuseinjurylaw.com/glossary/elder-sexual-abuse/",
        "https://nursingabuseinjurylaw.com/glossary/feeder-table/",
        "https://nursingabuseinjurylaw.com/glossary/gait-belt/",
        "https://nursingabuseinjurylaw.com/glossary/group-home-abuse/",
        "https://nursingabuseinjurylaw.com/glossary/improper-wound-care/",
        "https://nursingabuseinjurylaw.com/glossary/low-air-loss-mattress/",
        "https://nursingabuseinjurylaw.com/glossary/medical-director/",
        "https://nursingabuseinjurylaw.com/glossary/mechanical-soft-diet/",
        "https://nursingabuseinjurylaw.com/glossary/memory-care-units/",
        "https://nursingabuseinjurylaw.com/glossary/nursing-home-administrator/",
        "https://nursingabuseinjurylaw.com/glossary/nursing-home-understaffing/",
        "https://nursingabuseinjurylaw.com/glossary/nursing-home-abandonment/",
        "https://nursingabuseinjurylaw.com/glossary/nursing-home-abuse/",
        "https://nursingabuseinjurylaw.com/glossary/osteomyelitis/",
        "https://nursingabuseinjurylaw.com/glossary/physical-abuse/",
        "https://nursingabuseinjurylaw.com/glossary/restraint-injuries/",
        "https://nursingabuseinjurylaw.com/glossary/residential-care-facility-abuse/",
        "https://nursingabuseinjurylaw.com/glossary/residential-treatment-center-abuse/",
        "https://nursingabuseinjurylaw.com/glossary/shear/",
        "https://nursingabuseinjurylaw.com/glossary/significant-weight-loss/",
        "https://nursingabuseinjurylaw.com/glossary/slide-board-transfer/",
        "https://nursingabuseinjurylaw.com/glossary/scoop-mattress-cover/",
        "https://nursingabuseinjurylaw.com/glossary/slip-and-fall-accidents/",
        "https://nursingabuseinjurylaw.com/glossary/wrongful-death/",
        "https://nursingabuseinjurylaw.com/glossary/wound-care-nurse/",
        "https://nursingabuseinjurylaw.com/glossary/wound-vac/",
        "https://nursingabuseinjurylaw.com/glossary/wandering-or-elopement/",
    ],

    OUTPUT: {
        CONTENT_DIR: "./downloads/content",
        IMAGES_DIR: "./downloads/images",
    },

    IMAGE_EXTRACTION: {
        relativePath: "/assets/uploads/",
        filenamePattern: "{slug}-{index}",
        filter: (url) => true,
        featuredImage: null,
    },

    DATA: {
        TITLE: {
            selector: "title",
            getValue: (el) => el.textContent.trim(),
        },

        DESCRIPTION: {
            selector: "meta[name='description']",
            getValue: (el) => el.getAttribute("content"),
        },

        BODY: {
            selector: ".elementor-widget-theme-post-content .elementor-widget-container",
            getValue: (el) => el.innerHTML,
            isContent: true,
        },
    }
}
