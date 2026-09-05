import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = path.join(__dirname, 'keys', 'private-key.pem');
const REGISTER_PATH = path.join(__dirname, 'licenses.json');
const PORT = process.env.PORT || 3333;

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function readRegister() {
  if (!fs.existsSync(REGISTER_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(REGISTER_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeRegister(data) {
  fs.writeFileSync(REGISTER_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function mintLicense(name, mid, days = 0, customExpiry = null) {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error('Private key missing in tools/keys/private-key.pem');
  }

  const cleanName = (name || '').trim();
  const cleanMid = (mid || '').trim().toUpperCase();

  if (!cleanName) throw new Error('Client / Shop Name is required');
  if (!cleanMid) throw new Error('Machine ID is required');

  const iat = Math.floor(Date.now() / 1000);
  let exp = 0;

  if (customExpiry) {
    const ms = Date.parse(`${customExpiry}T23:59:59`);
    if (isNaN(ms)) throw new Error('Invalid custom expiry date format');
    exp = Math.floor(ms / 1000);
    if (exp <= iat) throw new Error('Custom expiry date cannot be in the past');
  } else if (days > 0) {
    exp = iat + Math.round(days * 86400);
  }

  const privateKey = crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH));
  const payload = {
    v: 1,
    lid: crypto.randomUUID(),
    name: cleanName,
    mid: cleanMid,
    iat,
    exp,
  };

  const payloadSeg = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.sign(null, Buffer.from(payloadSeg), privateKey).toString('base64url');
  const licenseKey = `${payloadSeg}.${signature}`;

  const expiryHuman = exp === 0 ? 'perpetual' : new Date(exp * 1000).toISOString();
  const register = readRegister();

  const record = {
    lid: payload.lid,
    name: cleanName,
    mid: cleanMid,
    iat,
    exp,
    issuedAt: new Date(iat * 1000).toISOString(),
    expiry: expiryHuman,
    key: licenseKey,
  };

  register.push(record);
  writeRegister(register);

  return record;
}

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VyapaarSetu — License Management Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --card-border: #1f2937;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --success: #10b981;
      --whatsapp: #25d366;
      --whatsapp-hover: #20ba59;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 24px 16px; min-height: 100vh; }
    .container { max-width: 980px; margin: 0 auto; }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      font-weight: bold;
    }
    .brand-text h1 { font-size: 1.35rem; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
    .brand-text p { font-size: 0.8rem; color: var(--text-muted); }

    .stats-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 16px 20px;
      border-radius: 14px;
    }
    .stat-card .label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
    .stat-card .val { font-size: 1.7rem; font-weight: 800; color: #fff; margin-top: 4px; }

    .grid-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
    }
    @media (min-width: 860px) {
      .grid-layout { grid-template-columns: 400px 1fr; }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 700;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 6px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    input, select {
      width: 100%;
      background: #0b0f19;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px 14px;
      color: #fff;
      font-size: 0.95rem;
      outline: none;
      transition: all 0.2s;
    }
    input:focus, select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }

    .btn {
      width: 100%;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 14px;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }

    .result-box {
      margin-top: 20px;
      padding: 16px;
      background: #0b0f19;
      border: 1px solid #1e293b;
      border-radius: 12px;
      display: none;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      margin-bottom: 10px;
    }
    .key-box {
      background: #111827;
      border: 1px dashed #374151;
      border-radius: 8px;
      padding: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #38bdf8;
      word-break: break-all;
      margin: 10px 0;
      max-height: 90px;
      overflow-y: auto;
    }
    .action-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
    .btn-secondary { background: #374151; }
    .btn-secondary:hover { background: #4b5563; }
    .btn-whatsapp { background: var(--whatsapp); color: #000; font-weight: 700; }
    .btn-whatsapp:hover { background: var(--whatsapp-hover); color: #000; }

    .table-container { overflow-x: auto; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem; }
    th { padding: 12px 14px; background: #0b0f19; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid var(--card-border); }
    td { padding: 14px; border-bottom: 1px solid var(--card-border); color: var(--text); }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .mono { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #93c5fd; }
    .action-icon-btn {
      background: #1f2937;
      border: none;
      color: #fff;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 600;
      transition: background 0.2s;
    }
    .action-icon-btn:hover { background: var(--primary); }
    .action-icon-btn.delete { color: #f87171; }
    .action-icon-btn.delete:hover { background: var(--danger); color: #fff; }

    .search-input {
      margin-bottom: 14px;
      background: #0b0f19;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 14px;
      width: 100%;
      color: #fff;
    }
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #10b981;
      color: #000;
      font-weight: 700;
      padding: 12px 20px;
      border-radius: 8px;
      display: none;
      box-shadow: 0 10px 20px rgba(0,0,0,0.3);
      z-index: 999;
      animation: fadeIn 0.2s ease;
    }
  </style>
</head>
<body>

<div class="container">
  <header>
    <div class="brand">
      <div class="brand-icon">VS</div>
      <div class="brand-text">
        <h1>VyapaarSetu License Hub</h1>
        <p>Admin Licensing & Machine-Bound Key Management</p>
      </div>
    </div>
    <div style="font-size: 0.85rem; color: #10b981; display: flex; align-items: center; gap: 6px;">
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
      Active & Connected
    </div>
  </header>

  <div class="stats-bar">
    <div class="stat-card">
      <div class="label">Total Issued</div>
      <div class="val" id="statTotal">0</div>
    </div>
    <div class="stat-card">
      <div class="label">Lifetime Licenses</div>
      <div class="val" id="statPerpetual">0</div>
    </div>
    <div class="stat-card">
      <div class="label">Time-Limited</div>
      <div class="val" id="statTimeLimited">0</div>
    </div>
  </div>

  <div class="grid-layout">
    <!-- Generator Column -->
    <div>
      <div class="card">
        <div class="card-title">⚡ Generate License Key</div>
        <form id="licenseForm" onsubmit="handleGenerate(event)">
          <div class="form-group">
            <label>Customer / Shop Name</label>
            <input type="text" id="custName" placeholder="e.g. Sharma Traders" required autocomplete="off">
          </div>

          <div class="form-group">
            <label>Machine ID (from App Activation Screen)</label>
            <input type="text" id="machineId" placeholder="XXXX-XXXX-XXXX-XXXX" required style="text-transform:uppercase; letter-spacing:1px;" autocomplete="off">
          </div>

          <div class="form-group">
            <label>Validity</label>
            <select id="validitySelect" onchange="toggleCustomDate()">
              <option value="0">Perpetual (Lifetime License)</option>
              <option value="365">1 Year (365 Days)</option>
              <option value="180">6 Months (180 Days)</option>
              <option value="30">1 Month Trial (30 Days)</option>
              <option value="7">7 Days Trial</option>
              <option value="custom">Custom Expiry Date</option>
            </select>
          </div>

          <div class="form-group" id="customDateGroup" style="display: none;">
            <label>Custom Expiry Date</label>
            <input type="date" id="customDate">
          </div>

          <button type="submit" class="btn" id="submitBtn">
            <span>🔑 Generate & Mint Key</span>
          </button>
        </form>

        <div class="result-box" id="resultBox">
          <span class="badge">✓ License Generated & Recorded</span>
          <div style="font-size:0.8rem; color:var(--text-muted);" id="resDetails"></div>
          <div class="key-box" id="keyOutput"></div>
          <div class="action-row">
            <button class="btn btn-secondary" onclick="copyKey()">📋 Copy Key</button>
            <button class="btn btn-whatsapp" onclick="shareWhatsApp()">💬 WhatsApp</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Ledger Column -->
    <div>
      <div class="card">
        <div class="card-title">📜 Issued Licenses Ledger</div>
        <input type="text" class="search-input" id="searchInput" placeholder="🔍 Search by customer name or machine ID..." oninput="renderTable()">
        
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Machine ID</th>
                <th>Validity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="ledgerTableBody">
              <tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Loading licenses...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="toast" id="toast">Copied to clipboard!</div>

<script>
  let licenses = [];
  let latestKey = "";
  let latestName = "";

  async function loadLicenses() {
    try {
      const res = await fetch('/api/licenses');
      licenses = await res.json();
      updateStats();
      renderTable();
    } catch (err) {
      console.error('Failed to load licenses:', err);
    }
  }

  function updateStats() {
    document.getElementById('statTotal').innerText = licenses.length;
    const perpetual = licenses.filter(l => l.exp === 0 || l.expiry === 'perpetual').length;
    document.getElementById('statPerpetual').innerText = perpetual;
    document.getElementById('statTimeLimited').innerText = licenses.length - perpetual;
  }

  function renderTable() {
    const query = (document.getElementById('searchInput').value || '').toLowerCase();
    const tbody = document.getElementById('ledgerTableBody');

    const filtered = licenses.filter(l => 
      (l.name && l.name.toLowerCase().includes(query)) ||
      (l.mid && l.mid.toLowerCase().includes(query))
    ).reverse();

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:24px;">No licenses found</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(l => {
      const isPerpetual = l.exp === 0 || l.expiry === 'perpetual';
      const expiryText = isPerpetual ? '<span style="color:#10b981; font-weight:600;">Lifetime</span>' : new Date(l.exp * 1000).toLocaleDateString('en-IN');
      const safeKey = encodeURIComponent(l.key);
      const safeName = encodeURIComponent(l.name);

      return \`
        <tr>
          <td>
            <div style="font-weight:700;">\${escapeHtml(l.name)}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">\${new Date(l.issuedAt || (l.iat * 1000)).toLocaleDateString('en-IN')}</div>
          </td>
          <td><span class="mono">\${escapeHtml(l.mid)}</span></td>
          <td>\${expiryText}</td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="action-icon-btn" title="Copy License Key" onclick="copyText('\${l.key}')">📋 Copy</button>
              <button class="action-icon-btn" title="Share via WhatsApp" onclick="shareWhatsAppDirect('\${safeName}', '\${safeKey}')">💬</button>
              <button class="action-icon-btn delete" title="Delete record" onclick="deleteLicense('\${l.lid}')">✕</button>
            </div>
          </td>
        </tr>
      \`;
    }).join('');
  }

  function toggleCustomDate() {
    const val = document.getElementById('validitySelect').value;
    document.getElementById('customDateGroup').style.display = val === 'custom' ? 'block' : 'none';
  }

  async function handleGenerate(e) {
    e.preventDefault();
    const name = document.getElementById('custName').value.trim();
    const mid = document.getElementById('machineId').value.trim();
    const validity = document.getElementById('validitySelect').value;
    const customDate = document.getElementById('customDate').value;

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = 'Minting Key...';

    try {
      const res = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mid,
          days: validity !== 'custom' ? parseInt(validity, 10) : 0,
          customExpiry: validity === 'custom' ? customDate : null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mint key');

      latestKey = data.key;
      latestName = data.name;

      document.getElementById('resDetails').innerText = \`\${data.name} • \${data.mid} • \${data.expiry}\`;
      document.getElementById('keyOutput').innerText = data.key;
      document.getElementById('resultBox').style.display = 'block';

      showToast('License Key generated & saved!');
      loadLicenses();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>🔑 Generate & Mint Key</span>';
    }
  }

  async function deleteLicense(lid) {
    if (!confirm('Are you sure you want to delete this license from the register?')) return;
    try {
      const res = await fetch('/api/licenses/' + lid, { method: 'DELETE' });
      if (res.ok) {
        showToast('License removed from register');
        loadLicenses();
      }
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  function copyKey() {
    copyText(latestKey);
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!');
    });
  }

  function shareWhatsApp() {
    shareWhatsAppDirect(latestName, latestKey);
  }

  function shareWhatsAppDirect(name, key) {
    const decodedName = decodeURIComponent(name);
    const decodedKey = decodeURIComponent(key);
    const text = \`Namaste \${decodedName},\\n\\nHere is your official activation license key for VyapaarSetu:\\n\\n\${decodedKey}\\n\\nPlease copy this key and paste it into the activation screen in your VyapaarSetu application.\`;
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2500);
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  loadLicenses();
</script>

</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // UI endpoint
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML_CONTENT);
  }

  // API: Get all licenses
  if (url.pathname === '/api/licenses' && req.method === 'GET') {
    const data = readRegister();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data));
  }

  // API: Mint new license
  if (url.pathname === '/api/licenses' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const record = mintLicense(payload.name, payload.mid, payload.days, payload.customExpiry);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(record));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Delete license
  if (url.pathname.startsWith('/api/licenses/') && req.method === 'DELETE') {
    const lid = url.pathname.replace('/api/licenses/', '');
    let register = readRegister();
    register = register.filter(l => l.lid !== lid);
    writeRegister(register);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true }));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('              🛡️ VYAPAARSETU LICENSE MANAGEMENT HUB                 ');
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`  💻 Open on your PC     : http://localhost:${PORT}`);
  console.log(`  📱 Open on your Mobile : http://${localIp}:${PORT}  (Same Wi-Fi)`);
  console.log('════════════════════════════════════════════════════════════════════\n');
});
