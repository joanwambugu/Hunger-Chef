import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Load history with enhanced design
async function loadHistory() {
  const auth = getAuth();
  const user = auth.currentUser;
  const historyContainer = document.getElementById("historyList");
  
  if (!user) {
    historyContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔐</div>
        <h3>Please Login First</h3>
        <p>You need to be logged in to view your recipe history.</p>
        <a href="/login" class="btn btn-primary">Login Now</a>
      </div>
    `;
    return;
  }

  try {
    // Show loading state
    historyContainer.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading your recipe history...</p>
      </div>
    `;

    const token = await user.getIdToken();
    const res = await fetch("/api/history", {
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to load history');
    }

    displayEnhancedHistory(data.history, data.summary);

  } catch (error) {
    console.error("Error loading history:", error);
    document.getElementById("historyList").innerHTML = `
      <div class="error-state">
        <div class="error-icon">❌</div>
        <h3>Unable to Load History</h3>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="loadHistory()">Try Again</button>
      </div>
    `;
  }
}

// Display enhanced history with beautiful design
function displayEnhancedHistory(history, summary) {
  const container = document.getElementById('historyList');
  
  if (!history || history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <h3>No Recipe History Yet</h3>
        <p>Your generated recipes will appear here. Start by creating your first recipe!</p>
        <div class="empty-actions">
          <a href="/dashboard" class="btn btn-primary">
            🍳 Create First Recipe
          </a>
          <a href="/" class="btn btn-secondary">
            🏠 Back to Home
          </a>
        </div>
      </div>
    `;
    return;
  }

  // Create summary statistics
  const statsHTML = `
    <div class="history-summary">
      <div class="summary-card">
        <div class="summary-icon">📊</div>
        <div class="summary-content">
          <h4>Recipe History Summary</h4>
          <div class="summary-stats">
            <div class="summary-stat">
              <span class="stat-value">${summary.total_recipes}</span>
              <span class="stat-label">Total Recipes</span>
            </div>
            <div class="summary-stat">
              <span class="stat-value">${summary.recent_count}</span>
              <span class="stat-label">Last 24h</span>
            </div>
            <div class="summary-stat">
              <span class="stat-value">${summary.average_read_time}m</span>
              <span class="stat-label">Avg. Read Time</span>
            </div>
            <div class="summary-stat">
              <span class="stat-value">${summary.total_words}</span>
              <span class="stat-label">Total Words</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Create search and filter bar
  const filtersHTML = `
    <div class="history-filters">
      <div class="filter-group">
        <label for="searchInput" class="filter-label">🔍 Search Recipes:</label>
        <input type="text" id="searchInput" placeholder="Search by ingredients or recipe name..." class="search-input">
      </div>
      <div class="filter-group">
        <button class="filter-btn active" data-filter="all">All Recipes</button>
        <button class="filter-btn" data-filter="recent">Recent First</button>
        <button class="filter-btn" data-filter="oldest">Oldest First</button>
      </div>
    </div>
  `;

  // Create recipe cards grid
  const recipesHTML = history.map(entry => `
    <div class="recipe-card" data-id="${entry.id}" data-ingredients="${entry.ingredients.toLowerCase()}" data-date="${entry.created_at}">
      <div class="card-header">
        <div class="recipe-meta">
          <span class="recipe-date">
            <span class="date-icon">📅</span>
            ${entry.date_display}
          </span>
          <span class="recipe-time">
            ${entry.time_display}
          </span>
        </div>
        <div class="card-actions">
          <button class="action-btn copy-btn" title="Copy Recipe" onclick="copyRecipeFromCard(this)">
            📋
          </button>
          <button class="action-btn expand-btn" title="Expand Recipe" onclick="toggleRecipe(this)">
            📖
          </button>
        </div>
      </div>

      <div class="ingredients-preview">
        <span class="ingredients-icon">🥕</span>
        <span class="ingredients-text" title="${entry.ingredients}">
          ${entry.ingredients.length > 50 ? entry.ingredients.substring(0, 50) + '...' : entry.ingredients}
        </span>
      </div>

      <div class="recipe-preview">
        ${entry.recipe_preview}
      </div>

      <div class="recipe-full" style="display: none;">
        <div class="recipe-content">
          <pre>${entry.recipe}</pre>
        </div>
        <div class="recipe-actions">
          <button class="btn btn-secondary btn-small" onclick="regenerateRecipe('${entry.ingredients.replace(/'/g, "\\'")}')">
            🔄 Regenerate
          </button>
          <button class="btn btn-primary btn-small" onclick="useRecipe('${entry.ingredients.replace(/'/g, "\\'")}')">
            🍳 Use Again
          </button>
        </div>
      </div>

      <div class="card-footer">
        <div class="recipe-stats">
          <span class="stat">
            <span class="stat-icon">⏱️</span>
            ${entry.stats.read_time} min read
          </span>
          <span class="stat">
            <span class="stat-icon">📝</span>
            ${entry.stats.step_count} steps
          </span>
          <span class="stat">
            <span class="stat-icon">📄</span>
            ${entry.stats.word_count} words
          </span>
        </div>
      </div>
    </div>
  `).join('');

  // No results message
  const noResultsHTML = `
    <div id="noResults" class="empty-state" style="display: none;">
      <div class="empty-icon">🔍</div>
      <h3>No recipes found</h3>
      <p>Try different search terms or check your spelling.</p>
      <button class="btn btn-primary" onclick="clearSearch()">Show All Recipes</button>
    </div>
  `;

  container.innerHTML = statsHTML + filtersHTML + `<div class="recipes-grid" id="recipesGrid">${recipesHTML}</div>` + noResultsHTML;

  // Initialize interactive features
  initializeHistoryInteractions();
}

// Initialize search and filter functionality
function initializeHistoryInteractions() {
  // Search functionality
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const searchTerm = e.target.value.toLowerCase();
      const recipeCards = document.querySelectorAll('.recipe-card');
      let visibleCount = 0;

      recipeCards.forEach(card => {
        const ingredients = card.getAttribute('data-ingredients');
        const recipeText = card.querySelector('.recipe-preview').textContent.toLowerCase();
        
        if (ingredients.includes(searchTerm) || recipeText.includes(searchTerm)) {
          card.style.display = 'block';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      // Show/hide no results message
      const noResults = document.getElementById('noResults');
      if (visibleCount === 0 && searchTerm.length > 0) {
        noResults.style.display = 'block';
      } else {
        noResults.style.display = 'none';
      }
    });
  }

  // Filter functionality
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      // Update active state
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      const filter = this.getAttribute('data-filter');
      const recipeCards = Array.from(document.querySelectorAll('.recipe-card'));
      const grid = document.getElementById('recipesGrid');

      if (filter === 'recent') {
        recipeCards.sort((a, b) => new Date(b.getAttribute('data-date')) - new Date(a.getAttribute('data-date')));
      } else if (filter === 'oldest') {
        recipeCards.sort((a, b) => new Date(a.getAttribute('data-date')) - new Date(b.getAttribute('data-date')));
      }

      // Reappend sorted cards
      recipeCards.forEach(card => grid.appendChild(card));
    });
  });
}

// Toggle recipe expansion
function toggleRecipe(button) {
  const card = button.closest('.recipe-card');
  const fullRecipe = card.querySelector('.recipe-full');
  const isExpanded = fullRecipe.style.display === 'block';

  if (isExpanded) {
    fullRecipe.style.display = 'none';
    button.innerHTML = '📖';
    button.title = 'Expand Recipe';
  } else {
    fullRecipe.style.display = 'block';
    button.innerHTML = '📕';
    button.title = 'Collapse Recipe';
    
    // Scroll to expanded card
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Copy recipe from card
async function copyRecipeFromCard(button) {
  const card = button.closest('.recipe-card');
  const recipeText = card.querySelector('.recipe-full pre')?.textContent || 
                    card.querySelector('.recipe-preview').textContent;

  try {
    await navigator.clipboard.writeText(recipeText);
    
    // Visual feedback
    const original = button.innerHTML;
    button.innerHTML = '✅';
    button.title = 'Copied!';
    button.style.background = '#10b981';
    
    setTimeout(() => {
      button.innerHTML = original;
      button.title = 'Copy Recipe';
      button.style.background = '';
    }, 2000);
  } catch (err) {
    alert('Failed to copy recipe to clipboard');
  }
}

// Regenerate recipe with same ingredients
function regenerateRecipe(ingredients) {
  if (confirm('Generate a new recipe with these same ingredients?')) {
    window.location.href = `/dashboard?ingredients=${encodeURIComponent(ingredients)}`;
  }
}

// Use recipe ingredients again
function useRecipe(ingredients) {
  window.location.href = `/dashboard?ingredients=${encodeURIComponent(ingredients)}`;
}

// Clear search
function clearSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  }
}

// Generate recipe (existing function with minor improvements)
async function searchRecipe() {
  const ingredientsInput = document.getElementById("ingredients");
  const ingredients = ingredientsInput.value.trim();
  
  if (!ingredients) {
    alert("Please enter some ingredients first.");
    return;
  }

  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    alert("Please login first.");
    return;
  }

  const output = document.getElementById("recipeOutput");
  const generateBtn = document.querySelector('button[onclick="searchRecipe()"]');
  
  // Show loading state
  output.innerHTML = "<div class='loading-state'><div class='spinner'></div><p>🍳 Generating your recipe... Please wait.</p></div>";
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = "Generating...";
  }

  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/generate_recipe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ ingredients })
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || `HTTP error! status: ${res.status}`);
    }

    // Display the recipe with nice formatting
    output.innerHTML = `
      <div class="recipe-result">
        <div class="recipe-header">
          <h3>🎉 Your Custom Recipe</h3>
          <button class="copy-btn" onclick="copyRecipe()" title="Copy recipe">
            📋 Copy
          </button>
        </div>
        <div class="recipe-content">
          <pre>${data.recipe}</pre>
        </div>
        ${data.note ? `<div class="recipe-note">${data.note}</div>` : ''}
        <div class="recipe-footer">
          <span class="recipe-tip">💡 Recipe saved to your history</span>
        </div>
      </div>
    `;

    // Reload history to show the new entry
    await loadHistory();

  } catch (error) {
    console.error("Error generating recipe:", error);
    output.innerHTML = `<div class="error-state"><div class="error-icon">❌</div><p>${error.message}</p></div>`;
  } finally {
    // Reset button state
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = "Get Recipe";
    }
  }
}

// Copy recipe from dashboard
async function copyRecipe() {
  const recipeText = document.querySelector('.recipe-content pre')?.textContent;
  if (!recipeText) {
    alert("No recipe to copy!");
    return;
  }

  try {
    await navigator.clipboard.writeText(recipeText);
    const btn = document.querySelector('.copy-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ Copied!';
    setTimeout(() => { 
      btn.innerHTML = originalText; 
    }, 2000);
  } catch (err) {
    console.error('Failed to copy recipe:', err);
    alert("Failed to copy recipe to clipboard.");
  }
}

// Auto-load history when page loads
document.addEventListener('DOMContentLoaded', function() {
  // Check if we're on a page that has history functionality
  if (document.getElementById('historyList')) {
    loadHistory();
  }
});

// Expose globally so HTML buttons can call
window.searchRecipe = searchRecipe;
window.loadHistory = loadHistory;
window.copyRecipe = copyRecipe;
window.copyRecipeFromCard = copyRecipeFromCard;
window.toggleRecipe = toggleRecipe;
window.regenerateRecipe = regenerateRecipe;
window.useRecipe = useRecipe;
window.clearSearch = clearSearch;