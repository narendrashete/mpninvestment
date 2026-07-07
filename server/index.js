import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import 'dotenv/config';
import investments from './routes/investments.js';
import holdings from './routes/holdings.js';
import prices from './routes/prices.js';
import settings from './routes/settings.js';
import { sessionMiddleware, requireAuth, loginPage, handleLogin, handleLogout } from './middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware());

// Public — must come before requireAuth
app.get('/login', loginPage);
app.post('/login', handleLogin);
app.post('/api/auth/logout', handleLogout);

app.use(requireAuth);

app.use('/api/investments', investments);
app.use('/api/holdings', holdings);
app.use('/api/prices', prices);
app.use('/api/settings', settings);

// Serve the built client when available (production / start.bat)
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Investment tracker running at http://localhost:${PORT}`);
});
