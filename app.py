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
import google.generativeai as genai  #Gemini import
import requests

load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "super-secret")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
    "SQLALCHEMY_DATABASE_URI",
    "mysql+pymysql://root:password@127.0.0.1/ai_recipe_db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"

# ✅ Initialize Gemini client
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# IntaSend keys (placeholder)
INTASEND_PUBLIC = os.getenv("INTASEND_PUBLIC")
INTASEND_SECRET = os.getenv("INTASEND_SECRET")


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

    # attempt limiting / premium
    requests_today = db.Column(db.Integer, default=0)
    last_request_date = db.Column(db.Date, default=date.today)
    premium = db.Column(db.Boolean, default=False)

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


class Payment(db.Model):
    __tablename__ = "payments"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# -------------------------
# Login loader
# -------------------------
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# -------------------------
# Helper: check daily limit and update
# -------------------------
def check_and_increment_limit(user: User):
    today = date.today()
    if user.last_request_date != today:
        user.requests_today = 0
        user.last_request_date = today

    if user.premium:
        # premium bypass
        user.requests_today += 1
        db.session.commit()
        return True, None

    if user.requests_today >= 2:
        return False, 0  # not allowed

    user.requests_today += 1
    db.session.commit()
    attempts_left = max(0, 2 - user.requests_today)
    return True, attempts_left


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

    # Check free limit (2/day) or premium
    allowed, attempts_left = check_and_increment_limit(current_user)
    if not allowed:
        return jsonify({"error": "Free limit reached. Upgrade to premium to continue."}), 403

    # Build Gemini prompt
    prompt = (
        "You are a helpful chef focused on nutritious, low-cost, low-waste recipes "
        "aligned with UN SDG 2 (Zero Hunger). Given the following available ingredients, "
        f"provide: a recipe name, a short description, ingredients list (if needed), and clear step-by-step instructions.\n\n"
        f"Available ingredients: {ingredients}\n\n"
        "Keep the recipe simple, nutritious, and appropriate for 1-4 people."
    )

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        recipe_text = response.text.strip()
    except Exception as e:
        return jsonify({"error": "Gemini error: " + str(e)}), 500

    # Save to history
    rh = RecipeHistory(user_id=current_user.id, ingredients=ingredients, recipe=recipe_text)
    db.session.add(rh)
    db.session.commit()

    return jsonify({"recipe": recipe_text, "attempts_left": attempts_left})


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
# Upgrade (IntaSend placeholder)
# -------------------------
@app.route("/upgrade", methods=["POST"])
@login_required
def upgrade():
    amount = request.form.get("amount", 5.00)
    payment = Payment(user_id=current_user.id, amount=amount, status="paid")
    db.session.add(payment)
    current_user.premium = True
    db.session.commit()
    return redirect(url_for("dashboard"))


# -------------------------
# Create DB helper route (DEV ONLY)
# -------------------------
@app.route("/_init_db")
def init_db():
    db.create_all()
    return "DB created"


# -------------------------
# Run
# -------------------------
if __name__ == "__main__":
    app.run(debug=True)
