// Configuration for StreamFlix application
const CONFIG = {
    // Primary API endpoint - fallback to local proxy if needed
    API_URLS: [
        'https://streamflix.22afed28-f0b2-46d0-8804-c90e25c90bd4.workers.dev',
        // Add alternative endpoints here as fallbacks
        // 'https://your-backup-api.workers.dev',
        // 'http://localhost:8787'  // For local development
    ],

    // TMDB Image URLs
    IMG_URL: 'https://image.tmdb.org/t/p/w500',
    IMG_URL_ORIGINAL: 'https://image.tmdb.org/t/p/original',
    IMG_URL_W780: 'https://image.tmdb.org/t/p/w780',

    // App settings
    APP_NAME: 'StreamFlix',
    DEFAULT_THEME: 'dark',
    MAX_HISTORY_ITEMS: 10,
    HERO_SLIDESHOW_INTERVAL: 5000,

    // Feature flags
    FEATURES: {
        ENABLE_PWA: true,
        ENABLE_SEARCH_SUGGESTIONS: true,
        ENABLE_GENRE_FILTER: true,
        ENABLE_FAVORITES: true,
        ENABLE_WATCH_HISTORY: true
    }
};

// Get the best available API URL
function getApiUrl() {
    // In a real application, you might want to test each URL
    // For now, return the first one (primary)
    return CONFIG.API_URLS[0];
}

// Export for use in other files
window.STREAMFLIX_CONFIG = CONFIG;
window.getApiUrl = getApiUrl;
