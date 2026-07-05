// DOM Elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-btn');
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');
const mainResults = document.getElementById('main-results');
const artistProfile = document.getElementById('artist-profile');
const albumsGrid = document.getElementById('albums-grid');
const filterTabs = document.querySelectorAll('.filter-tab');

// Modal Elements
const tracklistModal = document.getElementById('tracklist-modal');
const modalOverlay = document.getElementById('modal-overlay');
const modalClose = document.getElementById('modal-close');
const modalBody = document.getElementById('modal-body');

// Application State
let currentArtistData = null;
let currentAlbumsData = [];
let currentFilter = 'all';

// Audio Preview State
let currentAudio = null;
let currentPlayingRow = null;
let currentPlayingBtn = null;

// Event Listeners
searchForm.addEventListener('submit', handleSearchSubmit);
searchInput.addEventListener('input', handleSearchInput);
clearBtn.addEventListener('click', clearSearch);

// Modal Event Listeners
modalClose.addEventListener('click', closeTracklistModal);
modalOverlay.addEventListener('click', closeTracklistModal);

// Close modal on Escape key press
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !tracklistModal.classList.contains('hidden')) {
    closeTracklistModal();
  }
});

// Setup filter tab click handlers
filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.getAttribute('data-filter');
    renderAlbums();
  });
});

/**
 * Handle form submission
 */
function handleSearchSubmit(e) {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (query) {
    executeSearch(query);
  }
}

/**
 * Shows/hides clear button based on input value
 */
function handleSearchInput() {
  if (searchInput.value.length > 0) {
    clearBtn.classList.remove('hidden');
  } else {
    clearBtn.classList.add('hidden');
  }
}

/**
 * Clears search bar and resets state
 */
function clearSearch() {
  searchInput.value = '';
  clearBtn.classList.add('hidden');
  hideResults();
  showEmptyState();
  searchInput.focus();
}

/**
 * Helper to show the empty state and hide others
 */
function showEmptyState() {
  emptyState.classList.remove('hidden');
  mainResults.classList.add('hidden');
  loadingState.classList.add('hidden');
  errorContainer.classList.add('hidden');
}

/**
 * Helper to hide results and error messages
 */
function hideResults() {
  mainResults.classList.add('hidden');
  errorContainer.classList.add('hidden');
  loadingState.classList.add('hidden');
}

/**
 * Main function to fetch artist and album data from backend
 */
async function executeSearch(query) {
  // Show loading skeleton, hide other panels
  emptyState.classList.add('hidden');
  mainResults.classList.add('hidden');
  errorContainer.classList.add('hidden');
  loadingState.classList.remove('hidden');

  try {
    const response = await fetch(`/api/search?artist=${encodeURIComponent(query)}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`We couldn't find an artist named "${query}". Please check the spelling or try another search.`);
      } else if (response.status === 429) {
        throw new Error(`Spotify API is temporarily busy (Too many requests). Please wait a moment and try again.`);
      } else {
        const errJson = await response.json().catch(() => ({}));
        const message = errJson.details || errJson.error || 'Something went wrong fetching artist data.';
        throw new Error(message === 'Too many requests' ? 'Spotify API rate limit reached. Please wait a moment and try again.' : message);
      }
    }

    const data = await response.json();
    
    currentArtistData = data.artist;
    currentAlbumsData = data.albums;
    
    // Hide loading
    loadingState.classList.add('hidden');
    
    // Render the layout
    renderArtistProfile();
    renderAlbums();
    
    // Reveal results panel
    mainResults.classList.remove('hidden');
    
  } catch (error) {
    console.error('Search error:', error);
    loadingState.classList.add('hidden');
    
    // Display error message
    errorMessage.textContent = error.message;
    errorContainer.classList.remove('hidden');
    
    // If we have previous search results, don't show empty state; otherwise, show it
    if (!currentArtistData) {
      emptyState.classList.remove('hidden');
    }
  }
}

/**
 * Formats a number of followers into a reader-friendly string (e.g., 2.4M, 150K, etc.)
 */
function formatFollowers(num) {
  if (num === null || num === undefined) return '';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

/**
 * Renders the artist profile header section
 */
function renderArtistProfile() {
  if (!currentArtistData) return;

  const artistImg = currentArtistData.images && currentArtistData.images.length > 0 
    ? currentArtistData.images[0].url 
    : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300&auto=format&fit=crop'; // fallback placeholder

  const followersHtml = currentArtistData.followers !== null && currentArtistData.followers !== undefined
    ? `<span><i data-lucide="users"></i> ${formatFollowers(currentArtistData.followers)} Followers</span>`
    : '';

  const genresHtml = currentArtistData.genres && currentArtistData.genres.length > 0
    ? currentArtistData.genres.slice(0, 4).map(genre => `<span class="genre-tag">${genre}</span>`).join('')
    : '';

  artistProfile.innerHTML = `
    <div class="artist-image-container">
      <img src="${artistImg}" alt="${currentArtistData.name}" class="artist-img">
    </div>
    <div class="artist-info">
      <div class="artist-meta">
        <i data-lucide="music-2" style="width: 1.1rem; height: 1.1rem;"></i> Verified Artist
      </div>
      <h1 class="artist-name">${currentArtistData.name}</h1>
      <div class="artist-stats">
        ${followersHtml}
        <span><i data-lucide="music"></i> ${currentAlbumsData.length} Releases found</span>
      </div>
      ${genresHtml ? `<div class="artist-genres" style="margin-bottom: 1.5rem;">${genresHtml}</div>` : ''}
      <a href="${currentArtistData.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="artist-spotify-link">
        <i data-lucide="external-link"></i> Open on Spotify
      </a>
    </div>
  `;

  // Re-run Lucide script to inject svg paths inside the newly rendered HTML
  lucide.createIcons();
}

/**
 * Filters and renders the grid of albums/singles
 */
function renderAlbums() {
  if (!currentAlbumsData) return;

  // Filter based on active tab
  const filteredAlbums = currentAlbumsData.filter(album => {
    if (currentFilter === 'all') return true;
    return album.albumType === currentFilter;
  });

  // Clear previous entries
  albumsGrid.innerHTML = '';

  if (filteredAlbums.length === 0) {
    albumsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; width: 100%; box-shadow: none;">
        <i data-lucide="slash" class="empty-icon"></i>
        <h3>No ${currentFilter === 'album' ? 'Albums' : 'Singles & EPs'} Found</h3>
        <p>This artist doesn't have any releases in this category on Spotify.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Generate cards
  filteredAlbums.forEach(album => {
    const coverImg = album.images && album.images.length > 0
      ? album.images[0].url // index 0 is high res
      : 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300&auto=format&fit=crop'; // fallback

    // Extract release year
    const releaseYear = album.releaseDate ? album.releaseDate.split('-')[0] : 'N/A';
    
    // Create card element
    const card = document.createElement('div');
    card.className = 'album-card';
    
    // Set content (with clean corner play button)
    card.innerHTML = `
      <div class="album-art-wrapper">
        <img src="${coverImg}" alt="${album.name}" class="album-art" loading="lazy">
        <a href="${album.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-play-btn" aria-label="Open in Spotify">
          <i data-lucide="external-link"></i>
        </a>
      </div>
      <div class="album-details">
        <h3 class="album-name" title="${album.name}">${album.name}</h3>
        <div class="album-meta-row">
          <span class="album-badge badge-${album.albumType}">${album.albumType}</span>
          <span class="album-year" style="font-weight: 500;">${releaseYear}</span>
        </div>
      </div>
    `;

    // Handle smooth image fade-in transition
    const img = card.querySelector('.album-art');
    if (img.complete) {
      img.classList.add('loaded');
    } else {
      img.addEventListener('load', () => img.classList.add('loaded'));
    }

    // Open tracklist modal on clicking card (except when play button itself is clicked)
    card.addEventListener('click', () => openTracklistModal(album, coverImg, releaseYear));

    // Prevent modal triggering when play button is clicked
    const playBtn = card.querySelector('.spotify-play-btn');
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    albumsGrid.appendChild(card);
  });

  // Re-run Lucide script to inject svg paths
  lucide.createIcons();
}

/**
 * Format duration from ms to mm:ss format
 */
function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/**
 * Opens modal and loads the album's track list dynamically
 */
async function openTracklistModal(album, coverImg, releaseYear) {
  // Show modal and stop body scroll
  tracklistModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Stop any playing audio
  stopAudio();

  // Render modal loading skeleton state
  modalBody.innerHTML = `
    <div class="skeleton-modal-header">
      <div class="skeleton-modal-art"></div>
      <div class="skeleton-details" style="flex-grow: 1;">
        <div class="skeleton-line title" style="width: 70%; height: 2.25rem;"></div>
        <div class="skeleton-line subtitle" style="width: 40%; height: 1.25rem;"></div>
      </div>
    </div>
    <div class="skeleton-modal-rows">
      <div class="skeleton-modal-row"></div>
      <div class="skeleton-modal-row"></div>
      <div class="skeleton-modal-row"></div>
      <div class="skeleton-modal-row"></div>
    </div>
  `;

  try {
    const response = await fetch(`/api/albums/${album.id}/tracks`);
    if (!response.ok) {
      throw new Error('Failed to retrieve tracks for this album.');
    }

    const data = await response.json();
    const tracks = data.tracks;

    // Render modal content
    modalBody.innerHTML = `
      <div class="modal-album-header">
        <img src="${coverImg}" alt="${album.name}" class="modal-album-art">
        <div class="modal-album-info">
          <span class="modal-artist-name">${currentArtistData.name}</span>
          <h2 class="modal-album-title">${album.name}</h2>
          <span class="modal-album-meta">
            ${album.albumType.toUpperCase()} • ${releaseYear} • ${tracks.length} Songs
          </span>
        </div>
      </div>

      <div class="tracklist-container">
        ${tracks.map(track => {
          const explicitBadge = track.explicit ? '<span class="explicit-badge">E</span>' : '';
          const hasPreview = track.previewUrl !== null;
          
          // Generate left side indicator: show play button if preview is available, otherwise number
          const actionIndicator = hasPreview
            ? `<div class="track-play-pause" data-preview="${track.previewUrl}" aria-label="Play preview">
                 <i data-lucide="play" style="fill: currentColor;"></i>
               </div>`
            : `<div class="track-number">${track.trackNumber}</div>`;

          return `
            <div class="track-row" id="track-${track.id}">
              ${actionIndicator}
              <div class="track-name-wrapper">
                <span class="track-name" title="${track.name}">${track.name}</span>
                ${explicitBadge}
              </div>
              <span class="track-duration">${formatDuration(track.durationMs)}</span>
            </div>
          `;
        }).join('')}
      </div>

      <div class="modal-actions">
        <a href="${album.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="artist-spotify-link">
          <i data-lucide="external-link"></i> Play Full Album on Spotify
        </a>
      </div>
    `;

    lucide.createIcons();

    // Hook up audio player interactions
    const playPauseButtons = modalBody.querySelectorAll('.track-play-pause');
    playPauseButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const previewUrl = btn.getAttribute('data-preview');
        const trackRow = btn.closest('.track-row');
        toggleTrackPreview(previewUrl, trackRow, btn);
      });
    });

  } catch (error) {
    console.error('Error loading tracks:', error);
    modalBody.innerHTML = `
      <div class="empty-state" style="padding: 3rem 1rem; box-shadow: none;">
        <i data-lucide="alert-circle" class="empty-icon" style="color: #ef4444;"></i>
        <h3>Failed to Load Tracks</h3>
        <p>${error.message || 'Could not fetch discography tracks from Spotify.'}</p>
        <div class="modal-actions" style="margin-top: 1.5rem; justify-content: center; border: none; padding: 0;">
          <a href="${album.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="artist-spotify-link">
            <i data-lucide="external-link"></i> Open on Spotify Directly
          </a>
        </div>
      </div>
    `;
    lucide.createIcons();
  }
}

/**
 * Handles playing/pausing a 30s preview track row
 */
function toggleTrackPreview(url, row, btn) {
  if (currentPlayingRow === row) {
    // Clicked the currently playing track -> Pause it
    stopAudio();
  } else {
    // Clicked a different track (or none was playing) -> Start playing new track
    stopAudio();

    currentAudio = new Audio(url);
    currentPlayingRow = row;
    currentPlayingBtn = btn;

    currentAudio.play();
    
    // Update UI state to playing
    row.classList.add('playing');
    btn.innerHTML = '<i data-lucide="pause" style="fill: currentColor;"></i>';
    lucide.createIcons();

    // Handle end of playback
    currentAudio.addEventListener('ended', () => {
      stopAudio();
    });
  }
}

/**
 * Stops any active audio and resets playing states
 */
function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (currentPlayingRow) {
    currentPlayingRow.classList.remove('playing');
    
    if (currentPlayingBtn) {
      currentPlayingBtn.innerHTML = '<i data-lucide="play" style="fill: currentColor;"></i>';
    }
    
    currentPlayingRow = null;
    currentPlayingBtn = null;
    lucide.createIcons();
  }
}

/**
 * Closes tracklist modal and resets scroll and audio state
 */
function closeTracklistModal() {
  tracklistModal.classList.add('hidden');
  document.body.style.overflow = '';
  stopAudio();
}
