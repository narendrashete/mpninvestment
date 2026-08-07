import session from 'express-session';
import bcrypt from 'bcryptjs';

// Multiple users, each bound to one investment group. User 1 is
// AUTH_USERNAME/AUTH_PASSWORD_HASH/AUTH_GROUP (AUTH_GROUP defaults to 'MPN' so
// the original single-admin .env keeps working untouched); additional users
// are AUTH_USERNAME_2/AUTH_PASSWORD_HASH_2/AUTH_GROUP_2, _3, etc.
function loadUsers() {
  const users = [];
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? '' : `_${i}`;
    const username = process.env[`AUTH_USERNAME${suffix}`];
    const passwordHash = process.env[`AUTH_PASSWORD_HASH${suffix}`];
    if (!username || !passwordHash) break;
    const group = process.env[`AUTH_GROUP${suffix}`] || 'MPN';
    users.push({ username, passwordHash, group });
  }
  return users;
}

const USERS = loadUsers();
// Auth only activates once at least one user is configured — local dev via
// start.bat previously had none, so it behaved with no login screen.
const AUTH_ENABLED = USERS.length > 0;

export function sessionMiddleware() {
  return session({
    secret: process.env.SESSION_SECRET || 'dev-secret-not-for-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
  });
}

function loginHtml(error) {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in — InvestTrack</title>
<style>
  * { box-sizing: border-box; }
  html, body { overflow-x: hidden; }
  body { font-family: system-ui, sans-serif; background: #f4f6fa; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
  form { background: #fff; padding: 32px 36px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.1);
         width: 100%; max-width: 320px; }
  .badge-icon { width: 52px; height: 52px; border-radius: 50%; background: #eff6ff; color: #2563eb;
                display: flex; align-items: center; justify-content: center; font-size: 24px;
                font-weight: 700; margin: 0 auto 16px; }
  h1 { font-size: 18px; margin: 0 0 20px; text-align: center; }
  input { width: 100%; padding: 11px 12px; margin-bottom: 12px; border: 1px solid #cbd5e1; border-radius: 8px;
          font-size: 16px; box-sizing: border-box; }
  button { width: 100%; padding: 12px; background: #2563eb; color: #fff; border: none; border-radius: 8px;
           font-size: 15px; cursor: pointer; }
  .err { color: #dc2626; font-size: 13px; margin: -6px 0 12px; }

  .pw-wrap { position: relative; }
  .pw-wrap input { padding-right: 40px; margin-bottom: 0; }
  .pw-toggle { position: absolute; top: 0; right: 0; height: 100%; width: 40px; border: none; background: none;
               display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; padding: 0; }
  .pw-toggle svg { width: 20px; height: 20px; }
  .pw-toggle .eye-off { display: none; }
  .pw-wrap.revealed .eye { display: none; }
  .pw-wrap.revealed .eye-off { display: block; }
  form > .pw-wrap { margin-bottom: 12px; }

  /* Phones: fill more of the screen, bigger everything, feels app-like */
  @media (max-width: 480px) {
    body { padding: 0; align-items: stretch; }
    form { max-width: none; width: 100%; min-height: 100vh; border-radius: 0; box-shadow: none;
           display: flex; flex-direction: column; justify-content: center; padding: 32px 28px; }
    .badge-icon { width: 64px; height: 64px; font-size: 30px; margin-bottom: 20px; }
    h1 { font-size: 26px; margin-bottom: 32px; }
    input { padding: 15px 14px; margin-bottom: 16px; font-size: 17px; border-radius: 10px; }
    .pw-wrap input { margin-bottom: 0; }
    button { padding: 16px; font-size: 17px; font-weight: 600; border-radius: 10px; }
    .err { font-size: 14px; margin: -8px 0 14px; }
    .pw-toggle { width: 48px; }
  }
</style></head>
<body>
  <form method="POST" action="/login">
    <div class="badge-icon">₹</div>
    <h1>InvestTrack</h1>
    ${error ? `<div class="err">${error}</div>` : ''}
    <input name="username" placeholder="Username" autofocus required />
    <div class="pw-wrap" id="pwWrap">
      <input name="password" type="password" placeholder="Password" required id="pwInput" />
      <button type="button" class="pw-toggle" id="pwToggle" aria-label="Show password" tabindex="-1">
        <svg class="eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
        <svg class="eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.4 19.4 0 0 1 4.22-5.44M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a19.4 19.4 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
      </button>
    </div>
    <button type="submit">Sign in</button>
  </form>
  <script>
    document.getElementById('pwToggle').addEventListener('click', function () {
      var input = document.getElementById('pwInput');
      var wrap = document.getElementById('pwWrap');
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      wrap.classList.toggle('revealed', !showing);
      this.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  </script>
</body></html>`;
}

export function loginPage(req, res) {
  res.set('Cache-Control', 'no-store');
  res.send(loginHtml());
}

export async function handleLogin(req, res) {
  const { username, password } = req.body || {};
  // Username is matched case-insensitively (so "PrimeDemo"/"primedemo" both
  // work); password stays case-sensitive via bcrypt.compare below.
  const uname = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const user = uname && USERS.find(u => u.username.toLowerCase() === uname);
  const ok = user && password && await bcrypt.compare(password, user.passwordHash);
  if (ok) {
    req.session.user = { username: user.username, group: user.group };
    return res.redirect('/');
  }
  res.status(401).send(loginHtml('Invalid username or password'));
}

export function handleLogout(req, res) {
  req.session.destroy(() => res.redirect('/login'));
}

export function requireAuth(req, res, next) {
  if (!AUTH_ENABLED) { req.user = { username: 'local', group: 'MPN' }; return next(); }
  if (req.session?.user) { req.user = req.session.user; return next(); }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  return res.redirect('/login');
}

// Who's logged in — lets the frontend show the current user/group.
export function whoami(req, res) {
  res.json(req.user || null);
}
