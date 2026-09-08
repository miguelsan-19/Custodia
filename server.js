'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

loadEnv();

const handlers = {
  status: require('./api/status'),
  setup: require('./api/setup'),
  login: require('./api/login'),
  logout: require('./api/logout'),
  state: require('./api/state'),
  persons: require('./api/persons'),
  personId: require('./api/persons/[id]'),
  movements: require('./api/movements'),
  movementId: require('./api/movements/[id]')
};

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const envFile = path.join(ROOT, '.env');
  try {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) { /* no hay .env, se usan variables del entorno */ }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function publicFilePath(urlPath) {
  let clean;
  try { clean = decodeURIComponent(urlPath.split('?')[0]); } catch (e) { clean = '/index.html'; }
  const p = clean === '/' ? '/index.html' : clean;
  const stripped = path.normalize(p).replace(/^(\.\.[/\\])+/, '').replace(/^([/\\])/, '');
  const full = path.join(PUBLIC_DIR, stripped);
  if (!full.startsWith(PUBLIC_DIR)) return null;
  return full;
}

function serveStatic(req, res) {
  const file = publicFilePath(req.url);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => {
      data += c.toString('utf8');
      if (data.length > 2e6) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function adaptRes(res) {
  return {
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      if (res.writableEnded) return;
      this.headersSent = true;
      const b = JSON.stringify(obj);
      res.writeHead(this.statusCode || 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(b)
      });
      res.end(b);
    }
  };
}

async function dispatch(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  req.query = {};
  req.body = null;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    req.body = await readBody(req);
  }

  const staticRoutes = {
    '/api/status': 'status',
    '/api/setup': 'setup',
    '/api/login': 'login',
    '/api/logout': 'logout',
    '/api/state': 'state',
    '/api/persons': 'persons',
    '/api/movements': 'movements'
  };

  if (staticRoutes[p]) {
    await handlers[staticRoutes[p]](req, adaptRes(res));
    return;
  }

  let m = p.match(/^\/api\/persons\/([^/]+)$/);
  if (m) {
    req.query.id = m[1];
    await handlers.personId(req, adaptRes(res));
    return;
  }
  m = p.match(/^\/api\/movements\/([^/]+)$/);
  if (m) {
    req.query.id = m[1];
    await handlers.movementId(req, adaptRes(res));
    return;
  }

  adaptRes(res).status(404).json({ error: 'Ruta no encontrada.' });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const p = new URL(req.url, 'http://localhost').pathname;
  if (p.startsWith('/api/')) {
    dispatch(req, res).catch(err => {
      console.error(err);
      try { adaptRes(res).status(500).json({ error: 'Error interno del servidor.' }); } catch (e) { /* res ya cerrada */ }
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('  CUSTODIA (modo local)');
  console.log('  Local:   http://localhost:' + PORT);
  console.log('  Base:    Supabase (requiere DATABASE_URL)');
  console.log('==============================================');
});