/**
 * Cloudflare Worker to proxy requests to The Movie Database (TMDB) API and handle video embeds.
 *
 * How it works:
 * 1. It intercepts requests from the frontend application.
 * 2. It reads the API key from a secure environment variable (TMDB_API_KEY).
 * 3. It forwards the request to the appropriate TMDB API endpoint.
 *    - `/?query=<search_term>`: Searches for movies.
 *    - `/?imdb_id=<imdb_id>`: Fetches movie details using an IMDb ID.
 *    - `/?tmdb_id=<tmdb_id>`: Fetches external IDs (like IMDb ID) for a TMDB movie ID.
 * 4. It handles video embed requests via `/?action=embed&provider=<provider>&imdb_id=<imdb_id>&type=<type>`.
 * 5. It returns the response from TMDB or embed URLs to the frontend, hiding the API key and provider URLs.
 */
export default {
  async fetch(request, env, ctx) {
    // Set CORS headers to allow requests from your website
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // For development. For production, lock this down to your domain.
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Content-Type-Options': 'nosniff', // For security
    };

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const apiKey = env.TMDB_API_KEY; // Get API key from secrets

    // Check if the secret key is configured
    if (!apiKey) {
      const errorResponse = {
        error: 'Server configuration error: TMDB_API_KEY secret not set.',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Centralized video provider configuration
    const videoProviderList = [
      { name: 'alpha', domain: 'vidsrc.cc', sandbox: true },
      { name: 'bravo', domain: 'vidrock.net', sandbox: true },
      { name: 'charlie', domain: 'vidsrc.me', sandbox: true },
      { name: 'delta', domain: 'vidfast.pro', sandbox: true }
    ];
    let tmdbApiUrl = '';
    const params = url.searchParams;
    const mediaType = params.get('type') === 'tv' ? 'tv' : 'movie';

    // Determine the action based on query parameters
    let action = 'error';
    if (params.has('details')) action = 'details';
    else if (params.has('credits')) action = 'credits';
    else if (params.has('popular')) action = 'popular';
    else if (params.has('query')) action = 'search';
    else if (params.has('imdb_id') && params.get('action') !== 'embed') action = 'findByImdbId';
    else if (params.has('tmdb_id')) action = 'getExternalIds';
    else if (params.get('action') === 'embed') action = 'embed';
    else if (params.get('action') === 'getProviders') action = 'getProviders';

    switch (action) {
      case 'details':
        tmdbApiUrl = `https://api.themoviedb.org/3/${mediaType}/${params.get('details')}?api_key=${apiKey}&language=en-US`;
        break;
      case 'credits':
        tmdbApiUrl = `https://api.themoviedb.org/3/${mediaType}/${params.get('credits')}/credits?api_key=${apiKey}&language=en-US`;
        break;
      case 'popular':
        const page = params.get('page') || '1'; // Get page number, default to 1
        const popularMediaType = params.get('media_type') || 'movie'; // Allow specifying media_type, default to movie
        tmdbApiUrl = `https://api.themoviedb.org/3/${popularMediaType}/popular?api_key=${apiKey}&language=en-US&page=${page}`;
        break;
      case 'search':
        tmdbApiUrl = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(params.get('query'))}&language=en-US&page=1`;
        break;
      case 'findByImdbId':
        tmdbApiUrl = `https://api.themoviedb.org/3/find/${params.get('imdb_id')}?api_key=${apiKey}&external_source=imdb_id`;
        break;
      case 'getExternalIds':
        tmdbApiUrl = `https://api.themoviedb.org/3/${mediaType}/${params.get('tmdb_id')}/external_ids?api_key=${apiKey}`;
        break;
      case 'embed':
        const provider = params.get('provider');
        const imdbId = params.get('imdb_id');
        if (provider && imdbId) {
          const embedUrl = generateEmbedUrl(provider, imdbId, mediaType, env);
          if (embedUrl) {
            return new Response(JSON.stringify({ embedUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ error: 'Invalid provider or unable to generate embed URL.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Fallthrough to error if params are missing
      case 'getProviders':
        return new Response(JSON.stringify({ providers: videoProviderList }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      default:
        const errorResponse = { error: 'Missing or invalid query parameters.' };
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
      // If we don't have a URL to fetch, it means we should have returned an error already.
      if (!tmdbApiUrl) throw new Error("Internal logic error: API URL not set.");

      const tmdbResponse = await fetch(tmdbApiUrl);
      const data = await tmdbResponse.json();

      // Return the response from TMDB to the client
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const errorResponse = { error: 'Failed to fetch data from TMDB API.' };
      return new Response(JSON.stringify(errorResponse), {
        status: 502, // Bad Gateway
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// Function to generate embed URLs for video providers
function generateEmbedUrl(provider, imdbId, type, env) {
  // Video provider configurations stored in environment variables
  const providerConfigs = {
    'vidsrc.cc': env.VIDSRC_CC_URL || 'https://vidsrc.cc/v2/embed/',
    'vidrock.net': env.VIDROCK_NET_URL || 'https://vidrock.net/',
    'vidsrc.me': env.VIDSRC_ME_URL || 'https://vidsrc.me/embed/',
    'vidfast.pro': env.VIDFAST_PRO_URL || 'https://vidfast.pro/'
  };

  const baseUrl = providerConfigs[provider];
  if (!baseUrl) return null;

  let embedUrl = '';

  switch (provider) {
    case 'vidsrc.cc':
      embedUrl = type === 'tv'
        ? `${baseUrl}tv/${imdbId}` // Let the provider handle season/episode
        : `${baseUrl}movie/${imdbId}`;
      break;
    case 'vidrock.net':
      embedUrl = type === 'tv'
        ? `${baseUrl}tv/${imdbId}` // Let the provider handle season/episode
        : `${baseUrl}movie/${imdbId}`;
      break;
    case 'vidsrc.me':
      embedUrl = `${baseUrl}${type}/${imdbId}`;
      break;
    case 'vidfast.pro':
      embedUrl = `${baseUrl}${type}/${imdbId}?autoPlay=true`;
      break;
    default:
      return null;
  }

  return embedUrl;
}
