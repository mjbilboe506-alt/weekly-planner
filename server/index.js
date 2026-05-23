import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlannerStore } from './db.js';
import { parseNaturalRecurrence } from './recurrence.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const defaultPublicDir = join(rootDir, 'public');
const defaultPort = Number(process.env.PORT || 8787);
const defaultDbPath = process.env.DB_PATH || join(rootDir, 'data', 'planner.db');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

export function startPlannerServer(options = {}) {
  const publicDir = options.publicDir || defaultPublicDir;
  const port = Number(options.port ?? defaultPort);
  const host = options.host || '0.0.0.0';
  const store = createPlannerStore(options.dbPath || defaultDbPath);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url, store);
        return;
      }

      await serveStatic(url.pathname, res, publicDir);
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Something went wrong' });
    }
  });

  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      const url = `http://${displayHost}:${actualPort}`;
      if (!options.silent) {
        console.log(`Weekly Planner running at ${url}`);
      }
      resolveServer({
        server,
        store,
        url,
        close: () => {
          server.close();
          store.close();
        }
      });
    });
  });
}

if (isDirectRun()) {
  const planner = await startPlannerServer();
  process.on('SIGINT', () => shutdown(planner));
  process.on('SIGTERM', () => shutdown(planner));
}

async function handleApi(req, res, url, store) {
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const date = url.searchParams.get('date') || todayString();
    store.generateDueTasks(date);
    sendJson(res, 200, {
      date,
      tasks: store.listTasks({ date }),
      recurringRules: store.listRecurringRules(),
      dueReminders: store.dueReminders(new Date())
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/reminders/due') {
    sendJson(res, 200, { dueReminders: store.dueReminders(new Date()) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/tasks') {
    const body = await readJson(req);
    const task = store.createTask(body);
    sendJson(res, 201, { task });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/recurring') {
    const body = await readJson(req);
    const parsed = body.naturalText ? parseNaturalRecurrence(body.naturalText) : null;
    const rule = store.createRecurringRule({
      title: body.title,
      notes: body.notes,
      frequency: parsed?.frequency || body.frequency,
      daysOfWeek: parsed?.daysOfWeek || body.daysOfWeek || [],
      dayOfMonth: body.dayOfMonth,
      time: parsed?.time || body.time,
      helper: body.helper,
      naturalText: body.naturalText
    });
    const generated = store.generateDueTasks(todayString());
    sendJson(res, 201, { rule, generated });
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/status$/);
  if (req.method === 'PATCH' && statusMatch) {
    const body = await readJson(req);
    const task = store.updateTaskStatus(Number(statusMatch[1]), body.status);
    sendJson(res, 200, { task });
    return;
  }

  const snoozeMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/snooze$/);
  if (req.method === 'POST' && snoozeMatch) {
    const body = await readJson(req);
    const task = store.snoozeTask(Number(snoozeMatch[1]), Number(body.minutes || 10), new Date());
    sendJson(res, 200, { task });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function serveStatic(pathname, res, publicDir) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolve(publicDir, `.${requested}`);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    const fallback = join(publicDir, 'index.html');
    const html = await readFile(fallback);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  const file = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
  res.end(file);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function shutdown(planner) {
  planner.close();
  process.exit(0);
}

function isDirectRun() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
