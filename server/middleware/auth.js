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
  body { font-family: system-ui, sans-serif; background: #f4f6fa; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
  form { background: #fff; padding: 32px 36px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.1);
         width: 100%; max-width: 320px; }
  h1 { font-size: 18px; margin: 0 0 20px; }
  input { width: 100%; padding: 11px 12px; margin-bottom: 12px; border: 1px solid #cbd5e1; border-radius: 8px;
          font-size: 16px; box-sizing: border-box; }
  button { width: 100%; padding: 12px; background: #2563eb; color: #fff; border: none; border-radius: 8px;
           font-size: 15px; cursor: pointer; }
  .err { color: #dc2626; font-size: 13px; margin: -6px 0 12px; }
</style></head>
<body>
  <form method="POST" action="/login">
    <h1>₹ InvestTrack</h1>
    ${error ? `<div class="err">${error}</div>` : ''}
    <input name="username" placeholder="Username" autofocus required />
    <input name="password" type="password" placeholder="Password" required />
    <button type="submit">Sign in</button>
  </form>
</body></html>`;
}

export function loginPage(req, res) {
  res.send(loginHtml());
}

export async function handleLogin(req, res) {
  const { username, password } = req.body || {};
  const user = USERS.find(u => u.username === username);
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
