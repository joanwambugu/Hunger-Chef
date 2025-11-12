// Global variables
let allRecipes = [];
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'newest';

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('History page initialized');
    initializePage();
    loadHistory();
});

function initializePage() {
    // Setup search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function(e) {
            currentSearch = e.target.value.toLowerCase();
            filterAndDisplayRecipes();
        }, 300));
        
        // Clear search button
        const searchClear = document.querySelector('.search-clear');
        if (searchClear) {
            searchClear.addEventListener('click', function() {
                searchInput.value = '';
                currentSearch = '';
                filterAndDisplayRecipes();
            });
        }
    }
    
    // Setup filter buttons
    setupFilterButtons();
    
    // Setup sort functionality
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', function(e) {
            currentSort = e.target.value;
            sortAndDisplayRecipes();
        });
    }
    
    // Setup modal close functionality
    setupModal();
}

function setupFilterButtons() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active class from all buttons
            filterButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            filterAndDisplayRecipes();
        });
    });
}

function setupModal() {
    const modal = document.getElementById('recipeModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
}

function loadHistory() {
    console.log('Loading recipe history...');
    
    fetch('/api/history')
        .then(response => {
            console.log('Response status:', response.status);
            console.log('Response ok:', response.ok);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('History data received:', data);
            console.log('Number of recipes:', data.history ? data.history.length : 0);
            
            allRecipes = data.history || [];
            animateStats();
            filterAndDisplayRecipes();
        })
        .catch(error => {
            console.error('Error loading history:', error);
            displayError('Failed to load recipe history. Please check your connection and try again.');
        });
}
function animateStats() {
    // Animate total recipes count
    animateValue('totalRecipes', 0, allRecipes.length, 1000);
    
    // Calculate recipes from this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const thisMonthCount = allRecipes.filter(recipe => {
        const recipeDate = new Date(recipe.created_at);
        return recipeDate.getMonth() === currentMonth && recipeDate.getFullYear() === currentYear;
    }).length;
    
    animateValue('thisMonth', 0, thisMonthCount, 1000);
    
    // Calculate estimated food savings (assuming 500g per recipe)
    const estimatedSavings = Math.round(allRecipes.length * 0.5);
    animateValue('savings', 0, estimatedSavings, 1000);
}

function animateValue(elementId, start, end, duration) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const range = end - start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / range));
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        element.textContent = current;
        if (current === end) {
            clearInterval(timer);
        }
    }, stepTime);
}

function filterAndDisplayRecipes() {
    let filteredRecipes = [...allRecipes];
    
    // Apply search filter
    if (currentSearch) {
        filteredRecipes = filteredRecipes.filter(recipe => 
            recipe.ingredients.toLowerCase().includes(currentSearch) ||
            recipe.recipe.toLowerCase().includes(currentSearch)
        );
    }
    
    // Apply time filter
    switch(currentFilter) {
        case 'recent':
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            filteredRecipes = filteredRecipes.filter(recipe => 
                new Date(recipe.created_at) > oneWeekAgo
            );
            break;
        case 'favorite':
            // For future implementation
            break;
    }
    
    sortRecipes(filteredRecipes);
    displayRecipes(filteredRecipes);
}

function sortRecipes(recipes) {
    switch(currentSort) {
        case 'newest':
            recipes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
        case 'oldest':
            recipes.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case 'ingredients':
            recipes.sort((a, b) => a.ingredients.localeCompare(b.ingredients));
            break;
    }
}

function sortAndDisplayRecipes() {
    let filteredRecipes = [...allRecipes];
    
    // Reapply current filters
    if (currentSearch) {
        filteredRecipes = filteredRecipes.filter(recipe => 
            recipe.ingredients.toLowerCase().includes(currentSearch) ||
            recipe.recipe.toLowerCase().includes(currentSearch)
        );
    }
    
    sortRecipes(filteredRecipes);
    displayRecipes(filteredRecipes);
}

function displayRecipes(recipes) {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    if (!recipes || recipes.length === 0) {
        historyContent.innerHTML = createEmptyState();
        return;
    }
    
    let html = `
        <div class="results-header">
            <h3>Your Recipe Collection</h3>
            <span class="results-count">${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} found</span>
        </div>
        <div class="recipes-masonry">
    `;
    
    recipes.forEach((recipe, index) => {
        html += createRecipeCard(recipe, index);
    });
    
    html += `</div>`;
    
    // Add fade-in animation
    historyContent.style.opacity = '0';
    historyContent.innerHTML = html;
    setTimeout(() => {
        historyContent.style.opacity = '1';
        historyContent.style.transition = 'opacity 0.5s ease';
    }, 50);
    
    // Add intersection observer for scroll animations
    setupScrollAnimations();
}

function createRecipeCard(recipe, index) {
    const date = new Date(recipe.created_at);
    const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Extract recipe name and description
    const recipeLines = recipe.recipe.split('\n');
    const recipeName = recipeLines[0] || 'Delicious Creation';
    const recipeDescription = recipeLines[1] || 'A wonderful recipe made with your ingredients';
    
    // Determine recipe type based on ingredients
    const recipeType = getRecipeType(recipe.ingredients);
    const recipeIcon = getRecipeIcon(recipeType);
    
    return `
        <div class="recipe-card animate-in" data-recipe-id="${index}">
            <div class="card-badge ${recipeType}">
                <i class="${recipeIcon}"></i>
                ${recipeType.charAt(0).toUpperCase() + recipeType.slice(1)}
            </div>
            
            <div class="card-header">
                <div class="recipe-meta">
                    <div class="recipe-date">
                        <i class="fas fa-calendar me-2"></i>
                        ${formattedDate}
                    </div>
                    <div class="recipe-time">
                        <i class="fas fa-clock me-2"></i>
                        ${formattedTime}
                    </div>
                </div>
                <div class="card-actions">
                    <button class="action-btn favorite" onclick="toggleFavorite(${index})" title="Add to Favorites">
                        <i class="far fa-star"></i>
                    </button>
                    <button class="action-btn" onclick="shareRecipe(${index})" title="Share Recipe">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            </div>
            
            <div class="recipe-content">
                <h4 class="recipe-title">${escapeHtml(recipeName)}</h4>
                <p class="recipe-description">${escapeHtml(recipeDescription)}</p>
                
                <div class="ingredients-preview">
                    <div class="ingredients-header">
                        <i class="fas fa-shopping-basket me-2"></i>
                        <strong>Ingredients Used:</strong>
                    </div>
                    <div class="ingredients-tags">
                        ${createIngredientTags(recipe.ingredients)}
                    </div>
                </div>
                
                <div class="recipe-actions">
                    <button class="btn btn-primary btn-sm" onclick="viewFullRecipe(${index})">
                        <i class="fas fa-eye me-2"></i>View Recipe
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="regenerateRecipe('${recipe.ingredients.replace(/'/g, "\\'")}')">
                        <i class="fas fa-redo me-2"></i>Remix
                    </button>
                    <button class="btn btn-outline-primary btn-sm" onclick="copyRecipe(${index})">
                        <i class="fas fa-copy me-2"></i>Copy
                    </button>
                </div>
            </div>
        </div>
    `;
}

function createIngredientTags(ingredients) {
    const ingredientList = ingredients.split(',').slice(0, 4); // Show first 4 ingredients
    return ingredientList.map(ingredient => 
        `<span class="ingredient-tag">${ingredient.trim()}</span>`
    ).join('');
}

function getRecipeType(ingredients) {
    const ing = ingredients.toLowerCase();
    if (ing.includes('chicken') || ing.includes('beef') || ing.includes('fish') || ing.includes('pork')) {
        return 'protein';
    } else if (ing.includes('pasta') || ing.includes('rice') || ing.includes('bread') || ing.includes('potato')) {
        return 'carbs';
    } else if (ing.includes('chocolate') || ing.includes('sugar') || ing.includes('honey') || ing.includes('fruit')) {
        return 'dessert';
    } else {
        return 'vegetable';
    }
}

function getRecipeIcon(type) {
    const icons = {
        'protein': 'fas fa-drumstick-bite',
        'carbs': 'fas fa-bread-slice',
        'dessert': 'fas fa-ice-cream',
        'vegetable': 'fas fa-carrot'
    };
    return icons[type] || 'fas fa-utensils';
}

function createEmptyState() {
    if (allRecipes.length === 0) {
        return `
            <div class="empty-state animate-in">
                <div class="empty-icon">
                    <i class="fas fa-book-open"></i>
                </div>
                <h3>Your Recipe Book Awaits</h3>
                <p>Start your culinary journey by creating your first recipe. Turn ingredients into delicious meals and watch your collection grow!</p>
                <div class="empty-actions">
                    <a href="/dashboard" class="btn btn-primary btn-lg">
                        <i class="fas fa-plus me-2"></i>Create First Recipe
                    </a>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="empty-state animate-in">
                <div class="empty-icon">
                    <i class="fas fa-search"></i>
                </div>
                <h3>No Recipes Found</h3>
                <p>We couldn't find any recipes matching your search criteria. Try adjusting your filters or search terms.</p>
                <div class="empty-actions">
                    <button class="btn btn-outline-primary" onclick="clearFilters()">
                        <i class="fas fa-filter me-2"></i>Clear All Filters
                    </button>
                </div>
            </div>
        `;
    }
}

// Enhanced UI Functions
function viewFullRecipe(index) {
    const recipe = allRecipes[index];
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modalTitle || !modalBody) return;
    
    const recipeLines = recipe.recipe.split('\n');
    const recipeName = recipeLines[0] || 'Delicious Recipe';
    
    modalTitle.textContent = recipeName;
    modalBody.innerHTML = `
        <div class="modal-recipe">
            <div class="modal-ingredients">
                <h4><i class="fas fa-shopping-basket me-2"></i>Ingredients</h4>
                <div class="ingredients-list">${formatIngredients(recipe.ingredients)}</div>
            </div>
            <div class="modal-instructions">
                <h4><i class="fas fa-list-ol me-2"></i>Instructions</h4>
                <div class="instructions-content">${formatRecipeContent(recipe.recipe)}</div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="copyRecipe(${index}); closeModal();">
                    <i class="fas fa-copy me-2"></i>Copy Recipe
                </button>
                <button class="btn btn-outline-primary" onclick="regenerateRecipe('${recipe.ingredients.replace(/'/g, "\\'")}')">
                    <i class="fas fa-redo me-2"></i>Create Variation
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('recipeModal').style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('recipeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function formatIngredients(ingredients) {
    return ingredients.split(',')
        .map(ingredient => `<div class="ingredient-item">• ${ingredient.trim()}</div>`)
        .join('');
}

function formatRecipeContent(recipe) {
    return recipe.split('\n')
        .map(line => {
            if (line.trim().startsWith('**') && line.trim().endsWith('**')) {
                return `<h5>${line.replace(/\*\*/g, '')}</h5>`;
            } else if (line.trim().startsWith('-') || line.trim().match(/^\d+\./)) {
                return `<div class="instruction-step">${line.trim()}</div>`;
            } else if (line.trim()) {
                return `<p>${line.trim()}</p>`;
            }
            return '';
        })
        .join('');
}

// Enhanced interaction functions
function toggleFavorite(index) {
    const btn = event.currentTarget;
    btn.classList.toggle('favorited');
    const icon = btn.querySelector('i');
    if (icon) {
        icon.classList.toggle('far');
        icon.classList.toggle('fas');
    }
    
    // Add animation
    btn.style.transform = 'scale(1.2)';
    setTimeout(() => {
        btn.style.transform = 'scale(1)';
    }, 300);
}

function copyRecipe(index) {
    const recipe = allRecipes[index];
    const textToCopy = `Ingredients: ${recipe.ingredients}\n\nRecipe:\n${recipe.recipe}`;
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('Recipe copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy recipe:', err);
        showToast('Failed to copy recipe', 'error');
    });
}

function regenerateRecipe(ingredients) {
    showToast('Taking you to the kitchen...', 'info');
    setTimeout(() => {
        window.location.href = `/dashboard?ingredients=${encodeURIComponent(ingredients)}`;
    }, 1000);
}

function shareRecipe(index) {
    const recipe = allRecipes[index];
    const shareText = `Check out this recipe I made with Zero Hunger Chef!\n\nIngredients: ${recipe.ingredients}\n\n${recipe.recipe}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'My Zero Hunger Chef Recipe',
            text: shareText
        }).catch(err => {
            console.log('Error sharing:', err);
            copyRecipe(index);
        });
    } else {
        copyRecipe(index);
    }
}

function clearFilters() {
    currentSearch = '';
    currentFilter = 'all';
    currentSort = 'newest';
    
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    
    if (searchInput) searchInput.value = '';
    if (sortSelect) sortSelect.value = 'newest';
    
    // Reset filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const allFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allFilterBtn) allFilterBtn.classList.add('active');
    
    filterAndDisplayRecipes();
    showToast('Filters cleared', 'info');
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
        currentSearch = '';
        filterAndDisplayRecipes();
    }
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exportHistory() {
    showToast('Export feature coming soon!', 'info');
}

// Utility functions
function displayError(message) {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    historyContent.innerHTML = `
        <div class="error-state animate-in">
            <div class="error-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3>Something Went Wrong</h3>
            <p>${message}</p>
            <div class="error-actions">
                <button class="btn btn-warning" onclick="loadHistory()">
                    <i class="fas fa-redo me-2"></i>Try Again
                </button>
                <a href="/dashboard" class="btn btn-outline-primary">
                    <i class="fas fa-home me-2"></i>Back to Dashboard
                </a>
            </div>
        </div>
    `;
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${getToastIcon(type)} me-2"></i>
            ${message}
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function getToastIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'info': 'info-circle',
        'warning': 'exclamation-triangle'
    };
    return icons[type] || 'info-circle';
}

function setupScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.animate-in').forEach(el => {
        observer.observe(el);
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add floating ingredients animation
function animateFloatingIngredients() {
    const ingredients = document.querySelectorAll('.ingredient');
    ingredients.forEach((ing, index) => {
        ing.style.animationDelay = `${index * 0.5}s`;
    });
}

// Initialize animations when page loads
window.addEventListener('load', animateFloatingIngredients);