// ============================================================
// AUTH — admin-only login, no public signup
// ============================================================

const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");

// If already logged in on the login page, jump straight to dashboard.
auth.onAuthStateChanged((user) => {
  if (user && loginForm) {
    window.location.replace("dashboard.html");
  }
});

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginError.classList.remove("show");
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";

    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = "dashboard.html";
    } catch (err) {
      let msg = "Login nahi ho saka. Email/password check karein.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        msg = "Email ya password ghalat hai.";
      } else if (err.code === "auth/too-many-requests") {
        msg = "Bohat zyada attempts. Thori dair baad try karein.";
      } else if (err.code === "auth/network-request-failed") {
        msg = "Internet connection check karein.";
      }
      loginError.textContent = msg;
      loginError.classList.add("show");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Login";
    }
  });
}

// Shared guard for dashboard.html
function requireAuth(onReady) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.replace("index.html");
    } else {
      onReady(user);
    }
  });
}

function logout() {
  auth.signOut().then(() => window.location.replace("index.html"));
}
