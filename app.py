import os
from datetime import date, datetime
from flask import (
    Flask, render_template, request, redirect, url_for, flash, jsonify
)
from flask_sqlalchemy import SQLAlchemy
from flask_login import (
    LoginManager, login_user, login_required, logout_user, current_user, UserMixin
)
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import google.generativeai as genai  # Gemini import
import requests
import time
import hashlib

load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "super-secret")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///recipes.db"  # Force SQLite
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"

# ✅ Initialize Gemini client
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# -------------------------
# Models
# -------------------------
class User(db.Model, UserMixin):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), unique=True, nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(300), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Removed premium and usage tracking fields
    # All users now have unlimited access

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class RecipeHistory(db.Model):
    __tablename__ = "recipes_history"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    ingredients = db.Column(db.Text, nullable=False)
    recipe = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# Removed Payment model since no premium features


# -------------------------
# Login loader
# -------------------------
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# -------------------------
# Helper: No limits for anyone
# -------------------------
def check_and_increment_limit(user: User):
    # No tracking, no limits - always return success with unlimited attempts
    return True, "∞"


# -------------------------
# Helper functions for recipe generation
# -------------------------
def is_recipe_unique(recipe_text, ingredients):
    """Basic check to ensure recipe isn't too generic"""
    generic_phrases = [
        "stir fry", "chop everything", "mix together", 
        "simple recipe", "basic recipe", "cook until done"
    ]
    
    # Check if recipe contains too many generic phrases
    generic_count = sum(1 for phrase in generic_phrases if phrase in recipe_text.lower())
    return generic_count < 3  # Allow some generic phrases but not too many


def create_protein_recipe(ingredients):
    return f"""
🍳 **Creative Protein Dish** from: {ingredients}

**Marinated Protein Bowl**
A flavorful, protein-packed dish that makes the most of your ingredients.

**Marinade:**
- 2 tbsp oil
- 1 tbsp soy sauce or vinegar
- 1 tsp garlic powder
- 1 tsp paprika
- Salt and pepper

**Instructions:**
1. Chop protein and vegetables into uniform pieces
2. Whisk marinade ingredients and coat everything thoroughly
3. Let marinate for 15-30 minutes for better flavor
4. Heat a pan over medium-high heat
5. Cook protein first until nearly done (4-5 minutes)
6. Add vegetables and cook until tender-crisp (3-4 minutes)
7. Serve over grains or with crusty bread

**Chef's Tip:** The marinade tenderizes and adds deep flavor to simple ingredients!
"""


def create_carb_recipe(ingredients):
    return f"""
🍝 **Hearty Carb Creation** from: {ingredients}

**Savory Grain Medley**
A satisfying dish that transforms basic carbs into something special.

**Flavor Boosters:**
- 2 tbsp olive oil or butter
- 1 onion, finely chopped (if available)
- 2 cloves garlic, minced
- Herbs: thyme, oregano, or basil
- Grated cheese (optional)

**Instructions:**
1. Cook your base carb (pasta, rice, etc.) according to package directions
2. While cooking, chop other ingredients
3. Sauté aromatics in oil until fragrant
4. Add other ingredients and cook until tender
5. Combine with cooked carb and toss well
6. Season generously with salt, pepper, and herbs
7. Let rest 2 minutes before serving

**Chef's Tip:** Toast your grains in dry pan before cooking for nuttier flavor!
"""


def create_dessert_recipe(ingredients):
    return f"""
🍰 **Simple Sweet Treat** from: {ingredients}

**Fruit & Sweet Medley**
A quick dessert that satisfies sweet cravings without waste.

**Basic Sweet Base:**
- 2 tbsp sugar or honey
- 1 tsp cinnamon (optional)
- 1 tbsp butter or oil
- Squeeze of lemon juice

**Instructions:**
1. Chop fruits/sweets into bite-sized pieces
2. Combine with sweet base ingredients in a bowl
3. If using fruits, sauté in pan until softened (3-4 minutes)
4. For baked goods, toast lightly for better texture
5. Combine everything and serve warm
6. Top with yogurt or whipped cream if available

**Chef's Tip:** A pinch of salt enhances sweet flavors dramatically!
"""


def create_vegetable_recipe(ingredients):
    return f"""
🥗 **Garden Fresh Creation** from: {ingredients}

**Roasted Vegetable Medley**
Simple techniques that bring out natural sweetness and flavors.

**Seasoning Blend:**
- 2 tbsp olive oil
- 1 tsp dried herbs (thyme, rosemary, or Italian blend)
- ½ tsp garlic powder
- Salt and pepper to taste
- Squeeze of citrus (optional)

**Instructions:**
1. Preheat oven to 400°F (200°C)
2. Chop vegetables into similar-sized pieces
3. Toss with oil and seasonings until evenly coated
4. Spread in single layer on baking sheet
5. Roast for 20-25 minutes until tender and slightly caramelized
6. Stir halfway through cooking
7. Serve as side or main dish with grains

**Chef's Tip:** Don't overcrowd the pan - this steams instead of roasting!
"""


def create_varied_fallback_recipe(ingredients):
    """Create more varied fallback recipes based on ingredient types"""
    ingredients_lower = ingredients.lower()
    
    # Detect ingredient types for more specific fallbacks
    if any(word in ingredients_lower for word in ['chicken', 'beef', 'pork', 'fish']):
        return create_protein_recipe(ingredients)
    elif any(word in ingredients_lower for word in ['pasta', 'rice', 'noodles', 'bread']):
        return create_carb_recipe(ingredients) 
    elif any(word in ingredients_lower for word in ['sweet', 'sugar', 'chocolate', 'fruit']):
        return create_dessert_recipe(ingredients)
    else:
        return create_vegetable_recipe(ingredients)


# -------------------------
# Main Gemini Recipe Generator Function
# -------------------------
def generate_recipe_with_fallback(ingredients):
    """Try multiple Gemini models with better prompt engineering for unique recipes"""
    
    # Create a more specific and varied prompt
    prompt = (
        "You are a creative chef focused on reducing food waste. Create a UNIQUE recipe using EXACTLY these ingredients: {ingredients}\n\n"
        "IMPORTANT: Make this recipe DIFFERENT from standard recipes. Be creative and innovative!\n\n"
        "Please provide:\n"
        "1. A creative recipe name that reflects the ingredients\n"
        "2. A brief description of the dish\n" 
        "3. Required ingredients (only from the list provided plus basic pantry items)\n"
        "4. Clear, numbered step-by-step instructions\n"
        "5. Serving suggestions or variations\n\n"
        "Make the recipe practical for home cooking and emphasize using ALL the ingredients to minimize waste.\n"
        "Be specific about quantities and cooking times.\n"
        "Make sure this recipe is truly unique and not a generic stir-fry or salad.\n\n"
        "Available ingredients: {ingredients}"
    ).format(ingredients=ingredients)
    
    # List of models to try in order
    models_to_try = [
       "gemini-2.0-flash-001",  # Primary recommendation
        "gemini-1.5-flash-002",  # If you need a 1.5 model, use this specific version
    ]
    
    for model_name in models_to_try:
        try:
            print(f"Trying model: {model_name} with ingredients: {ingredients}")
            model = genai.GenerativeModel(model_name)
            
            # Add generation config for more varied responses
            response = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.9,  # Higher temperature for more creativity
                    top_p=0.8,
                    top_k=40,
                    max_output_tokens=2048,
                )
            )
            recipe_text = response.text.strip()
            
            # Validate response is unique and adequate
            if recipe_text and len(recipe_text) > 100 and is_recipe_unique(recipe_text, ingredients):
                print(f"Success with model: {model_name}")
                return recipe_text
            else:
                print(f"Recipe too short or not unique, trying next model...")
                continue
                
        except Exception as e:
            print(f"Model {model_name} failed: {str(e)}")
            continue
    
    # If all models fail, return a varied fallback recipe
    return create_varied_fallback_recipe(ingredients)


# -------------------------
# Routes: frontend pages
# -------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username") or request.form.get("email").split("@")[0]
        email = request.form.get("email")
        password = request.form.get("password")
        if not email or not password:
            flash("Email and password required", "danger")
            return redirect(url_for("register"))

        if User.query.filter((User.email == email) | (User.username == username)).first():
            flash("User already exists", "warning")
            return redirect(url_for("register"))

        user = User(username=username, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        flash("Registered successfully. Please login.", "success")
        return redirect(url_for("login"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")
        user = User.query.filter_by(email=email).first()
        if user and user.check_password(password):
            login_user(user)
            flash("Logged in", "success")
            return redirect(url_for("dashboard"))
        flash("Invalid credentials", "danger")
        return redirect(url_for("login"))
    return render_template("login.html")


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("Logged out", "info")
    return redirect(url_for("index"))


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html")


@app.route("/history")
@login_required
def history_page():
    return render_template("history.html")


# -------------------------
# API endpoints (JSON)
# -------------------------
@app.route("/api/generate_recipe", methods=["POST"])
@login_required
def api_generate_recipe():
    payload = request.get_json()
    ingredients = payload.get("ingredients", "").strip()
    if not ingredients:
        return jsonify({"error": "Please provide ingredients"}), 400

    # No limits - all users get unlimited access
    allowed, attempts_left = check_and_increment_limit(current_user)

    try:
        # Create unique ingredient string with timestamp to prevent identical requests
        unique_ingredients = f"{ingredients}_{int(time.time())}_{hashlib.md5(ingredients.encode()).hexdigest()[:8]}"
        
        # Use the improved recipe generator
        recipe_text = generate_recipe_with_fallback(unique_ingredients)
        
        # Save to history
        rh = RecipeHistory(user_id=current_user.id, ingredients=ingredients, recipe=recipe_text)
        db.session.add(rh)
        db.session.commit()

        return jsonify({
            "recipe": recipe_text, 
            "attempts_left": attempts_left,
            "note": "Creative recipe generated with your unique ingredients!"
        })

    except Exception as e:
        error_msg = str(e)
        print(f"Final error: {error_msg}")
        
        # Create emergency fallback recipe
        emergency_recipe = create_varied_fallback_recipe(ingredients)
        
        # Still save to history
        rh = RecipeHistory(user_id=current_user.id, ingredients=ingredients, recipe=emergency_recipe)
        db.session.add(rh)
        db.session.commit()
        
        return jsonify({
            "recipe": emergency_recipe, 
            "attempts_left": attempts_left,
            "note": "Emergency fallback - AI service unavailable"
        })


@app.route("/api/history", methods=["GET"])
@login_required
def api_history():
    rows = (
        RecipeHistory.query.filter_by(user_id=current_user.id)
        .order_by(RecipeHistory.created_at.desc())
        .all()
    )
    history = [
        {"ingredients": r.ingredients, "recipe": r.recipe, "created_at": r.created_at.isoformat()}
        for r in rows
    ]
    return jsonify({"history": history})


# -------------------------
# Debug route to check available models
# -------------------------
@app.route("/_debug_models")
def debug_models():
    """Debug route to check available Gemini models"""
    try:
        models = genai.list_models()
        available_models = []
        for model in models:
            if 'generateContent' in model.supported_generation_methods:
                available_models.append({
                    'name': model.name,
                    'methods': model.supported_generation_methods
                })
        return jsonify({"available_models": available_models})
    except Exception as e:
        return jsonify({"error": str(e)})


# -------------------------
# Create DB helper route (DEV ONLY)
# -------------------------
@app.route("/_init_db")
def init_db():
    db.create_all()
    return "DB created"


# -------------------------
# Create tables on startup
# -------------------------
with app.app_context():
    db.create_all()

# -------------------------
# Run
# -------------------------
if __name__ == "__main__":
    app.run(debug=True)