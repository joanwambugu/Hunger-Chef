import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Load history on dashboard
async function loadHistory() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    document.getElementById("historyList").innerHTML = "<p>Please login first.</p>";
    return;
  }

  const token = await user.getIdToken();
  const res = await fetch("/get_history", {
    headers: { "Authorization": token }
  });

  const data = await res.json();
  const list = document.getElementById("historyList");
  list.innerHTML = "";

  if (!data.history || data.history.length === 0) {
    list.innerHTML = "<p>No history yet.</p>";
    return;
  }

  data.history.forEach(entry => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${entry.date}</strong> - <em>${entry.ingredients}</em><br>${entry.recipe}`;
    list.appendChild(li);
  });
}

// Generate recipe
async function searchRecipe() {
  const ingredients = document.getElementById("ingredients").value;
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    alert("Please login first.");
    return;
  }

  const token = await user.getIdToken();
  const res = await fetch("/generate_recipe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": token
    },
    body: JSON.stringify({ ingredients })
  });

  const data = await res.json();
  if (data.error) {
    alert(data.error);
    return;
  }

  document.getElementById("recipeOutput").innerText = data.recipe;
  loadHistory();
}

// Expose globally so HTML buttons can call
window.searchRecipe = searchRecipe;
window.loadHistory = loadHistory;
