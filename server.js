import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve static path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Spotify Access Token Cache
let cachedToken = null;
let tokenExpiryTime = null;

/**
 * Retrieves a Spotify Client Credentials Access Token, caching it in memory.
 */
async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify API credentials are missing from the backend environment. Please check your .env file.');
  }

  // Use cached token if it's still valid
  if (cachedToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
    return cachedToken;
  }

  // Request new token
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Failed to authenticate with Spotify API:', errText);
    throw new Error(`Spotify Auth Error: ${response.statusText} (${response.status})`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Expire 60 seconds early to avoid edge cases
  tokenExpiryTime = Date.now() + (data.expires_in - 60) * 1000;

  return cachedToken;
}

/**
 * Deduplicate albums by name (lowercased) and release year.
 * Spotify often returns multiple entries (e.g. different markets, clean versions, deluxe).
 */
function deduplicateAlbums(albums) {
  const seen = new Set();
  return albums.filter(album => {
    // Basic cleanup: lowercase name and strip common variations
    const cleanName = album.name
      .toLowerCase()
      .replace(/\(deluxe[^)]*\)/g, '')
      .replace(/\(remastered[^)]*\)/g, '')
      .replace(/\(expanded[^)]*\)/g, '')
      .replace(/ - deluxe edition/g, '')
      .replace(/ - remastered/g, '')
      .trim();

    // Use release year + name to identify duplicate entries
    const releaseYear = album.release_date ? album.release_date.split('-')[0] : '';
    const key = `${cleanName}-${album.album_type}-${releaseYear}`;

    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// In-memory API Cache (10 minutes)
const apiCache = new Map();

// API Routes
app.get('/api/search', async (req, res) => {
  const { artist } = req.query;

  if (!artist || artist.trim() === '') {
    return res.status(400).json({ error: 'Artist search term is required.' });
  }

  const queryKey = artist.toLowerCase().trim();
  const cached = apiCache.get(queryKey);
  if (cached && (Date.now() - cached.timestamp < 10 * 60 * 1000)) {
    console.log(`[Cache Hit] Returning cached results for: ${queryKey}`);
    return res.json(cached.data);
  }

  try {
    const token = await getSpotifyToken();

    // 1. Search for artist by name
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(artist)}&type=artist&limit=1`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!searchRes.ok) {
      return res.status(searchRes.status).json({ error: 'Error calling Spotify search API.' });
    }

    const searchData = await searchRes.json();
    const artistObj = searchData.artists.items[0];

    if (!artistObj) {
      return res.status(404).json({ error: 'Artist not found.' });
    }

    // 2. Fetch albums for this artist ID (using pagination as Spotify limits requests to max 10 per page for some clients)
    let albumsList = [];
    let nextUrl = `https://api.spotify.com/v1/artists/${artistObj.id}/albums?include_groups=album,single&limit=10`;
    let pageCount = 0;

    while (nextUrl && pageCount < 10) {
      const albumsRes = await fetch(nextUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!albumsRes.ok) {
        const errText = await albumsRes.text();
        console.error('Spotify albums API call failed:', albumsRes.status, errText);
        if (albumsList.length === 0) {
          return res.status(albumsRes.status).json({ error: 'Error calling Spotify albums API.', details: errText });
        }
        break;
      }

      const albumsData = await albumsRes.json();
      albumsList.push(...(albumsData.items || []));
      nextUrl = albumsData.next;
      pageCount++;
      if (nextUrl) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const dedupedAlbums = deduplicateAlbums(albumsList);

    const responseData = {
      artist: {
        id: artistObj.id,
        name: artistObj.name,
        genres: artistObj.genres || [],
        followers: artistObj.followers ? artistObj.followers.total : null,
        images: artistObj.images || [],
        spotifyUrl: artistObj.external_urls.spotify
      },
      albums: dedupedAlbums.map(album => ({
        id: album.id,
        name: album.name,
        releaseDate: album.release_date,
        totalTracks: album.total_tracks,
        images: album.images,
        spotifyUrl: album.external_urls.spotify,
        albumType: album.album_type // 'album' or 'single'
      }))
    };

    // Save to Cache
    apiCache.set(queryKey, {
      data: responseData,
      timestamp: Date.now()
    });

    // Return unified results
    res.json(responseData);

  } catch (error) {
    console.error('Backend search API error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// API Route to fetch tracks of an album
app.get('/api/albums/:id/tracks', async (req, res) => {
  const albumId = req.params.id;

  try {
    const token = await getSpotifyToken();

    const tracksUrl = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;
    const tracksRes = await fetch(tracksUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!tracksRes.ok) {
      return res.status(tracksRes.status).json({ error: 'Error calling Spotify album tracks API.' });
    }

    const tracksData = await tracksRes.json();

    // Map to clean track objects
    const tracks = tracksData.items.map(track => ({
      id: track.id,
      name: track.name,
      trackNumber: track.track_number,
      durationMs: track.duration_ms,
      previewUrl: track.preview_url,
      explicit: track.explicit,
      spotifyUrl: track.external_urls.spotify
    }));

    res.json({ tracks });

  } catch (error) {
    console.error('Backend tracks API error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Fallback to serve index.html for undefined routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` Spotify Album Finder running on port ${PORT}`);
  console.log(` Live: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
