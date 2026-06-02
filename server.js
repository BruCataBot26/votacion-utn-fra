const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Persistencia ─────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) { console.error('Error cargando data.json:', e.message); }
  return { words1: {}, words2: {}, votes: [], turnos: [] };
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ words1, words2, votes, turnos }, null, 2));
  } catch (e) { console.error('Error guardando data.json:', e.message); }
}

let { words1, words2, votes, turnos } = loadData();

// ── WebSocket broadcast ───────────────────────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'state', words1, words2, total: votes.length, votes }));
});

// ── Rutas páginas ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/form'));
app.get('/form', (req, res) => res.sendFile(path.join(__dirname, 'public', 'form.html')));
app.get('/tv',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/admin',(req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/qr',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'qr.html')));

// ── API: votar ────────────────────────────────────────────────────────────────
app.post('/vote', (req, res) => {
  const { a1, a2 } = req.body;
  if (!a1 || !a2 || a1.trim().length < 2 || a2.trim().length < 2)
    return res.status(400).json({ error: 'Respuestas inválidas' });

  const w1 = a1.trim().toLowerCase();
  const w2 = a2.trim().toLowerCase();
  words1[w1] = (words1[w1] || 0) + 1;
  words2[w2] = (words2[w2] || 0) + 1;
  const vote = { q1: a1.trim(), q2: a2.trim(), ts: new Date().toISOString() };
  votes.push(vote);
  saveData();
  broadcast({ type: 'vote', words1, words2, total: votes.length, last: vote });
  res.json({ ok: true });
});

// ── API: reset (guarda turno antes de limpiar) ────────────────────────────────
app.post('/reset', (req, res) => {
  const { label } = req.body;
  if (votes.length > 0) {
    turnos.push({
      label: label || `Turno ${turnos.length + 1}`,
      ts: new Date().toISOString(),
      votes: [...votes],
      words1: { ...words1 },
      words2: { ...words2 }
    });
  }
  words1 = {}; words2 = {}; votes = [];
  saveData();
  broadcast({ type: 'state', words1, words2, total: 0, votes: [] });
  res.json({ ok: true });
});

// ── API: exportar CSV del turno actual ────────────────────────────────────────
app.get('/export/current', (req, res) => {
  const rows = votes.map(v =>
    `"${v.ts}","${v.q1.replace(/"/g,'""')}","${v.q2.replace(/"/g,'""')}"`
  );
  const csv = ['Timestamp,Q1 - Qué sumarías a tu barrio,Q2 - En qué te capacitarías', ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="turno_actual_${Date.now()}.csv"`);
  res.send('\uFEFF' + csv); // BOM para Excel
});

// ── API: exportar CSV de un turno guardado ────────────────────────────────────
app.get('/export/turno/:idx', (req, res) => {
  const idx = parseInt(req.params.idx);
  const turno = turnos[idx];
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
  const rows = turno.votes.map(v =>
    `"${v.ts}","${v.q1.replace(/"/g,'""')}","${v.q2.replace(/"/g,'""')}"`
  );
  const csv = ['Timestamp,Q1 - Qué sumarías a tu barrio,Q2 - En qué te capacitarías', ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${turno.label.replace(/\s/g,'_')}.csv"`);
  res.send('\uFEFF' + csv);
});

// ── API: datos para admin ─────────────────────────────────────────────────────
app.get('/data', (req, res) => res.json({ words1, words2, votes, total: votes.length, turnos }));

// ── API: QR como imagen PNG ───────────────────────────────────────────────────
app.get('/qr.png', async (req, res) => {
  try {
    const url = `${req.protocol}://${req.get('host')}/form`;
    const png = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'H',
      width: 400,
      margin: 2,
      color: { dark: '#1F4E79', light: '#FFFFFF' }
    });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: 'Error generando QR' });
  }
});

// ── API: URL del formulario (para TV) ─────────────────────────────────────────
app.get('/api/url', (req, res) => {
  res.json({ url: `${req.protocol}://${req.get('host')}/form` });
});

// ── Ping endpoint para mantener Railway despierto ─────────────────────────────
app.get('/ping', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === 'IPv4' && !net.internal) return net.address;
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║      SISTEMA VOTACIÓN UTN FRA 2026           ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  TV:      http://localhost:${PORT}/tv             ║`);
  console.log(`║  Form:    http://${ip}:${PORT}/form           ║`);
  console.log(`║  Admin:   http://localhost:${PORT}/admin          ║`);
  console.log(`║  QR:      http://localhost:${PORT}/qr             ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log(`  Votos cargados desde disco: ${votes.length}`);
  console.log(`  Turnos guardados: ${turnos.length}\n`);
});
