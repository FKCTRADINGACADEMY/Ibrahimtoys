// ============================================================
// AUTH — admin-only login, no public signup
// ============================================================

const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");

function showAuthToast(msg) {
  const t = document.getElementById("authToast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

// Show/hide password
document.getElementById("togglePasswordBtn")?.addEventListener("click", (e) => {
  const pwd = document.getElementById("password");
  const isHidden = pwd.type === "password";
  pwd.type = isHidden ? "text" : "password";
  e.currentTarget.textContent = isHidden ? "🙈" : "👁";
});

// Forgot password — sends a Firebase reset email to whatever is typed in the email field.
document.getElementById("forgotPasswordLink")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  if (!email) {
    showAuthToast("Pehle apna email likhein.");
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    showAuthToast("Password reset link email par bhej di gayi hai.");
  } catch (err) {
    showAuthToast("Reset email bhejne mein masla hua.");
  }
});

// This is an admin-only shop tool — there's no public signup, so this
// just points people to the real setup step (Firebase Console).
document.getElementById("createAccountBtn")?.addEventListener("click", () => {
  showAuthToast("Naya account sirf Firebase Console se admin add kar sakta hai.");
});

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
    const remember = document.getElementById("rememberMe")?.checked ?? true;

    loginError.classList.remove("show");
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";

    try {
      await auth.setPersistence(
        remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION
      );
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
      loginBtn.textContent = "↪ Login";
    }
  });
}

// Shared guard for dashboard.html
function requireAuth(onReady) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.replace("index.html");
    } else {
      const emailEl = document.getElementById("currentUserEmail");
      if (emailEl) emailEl.textContent = user.email;
      onReady(user);
    }
  });
}

function logout() {
  auth.signOut().then(() => window.location.replace("index.html"));
}
