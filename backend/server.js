const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'paperless.db');

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) { console.error('Failed to open database:', err.message); process.exit(1); }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first TEXT NOT NULL, last TEXT NOT NULL,
    nid TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL, pass TEXT NOT NULL, join_date TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, doc_type TEXT, full_name TEXT,
    nid TEXT, birth_date TEXT, phone TEXT, address TEXT,
    purpose TEXT, notes TEXT, status TEXT DEFAULT 'pending',
    created_date TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS request_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL, name TEXT, type TEXT, size INTEGER,
    FOREIGN KEY(request_id) REFERENCES requests(id)
  )`);
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.post('/api/register', (req, res) => {
  const { first, last, nid, email, phone, pass } = req.body;
  if (!first  !last  !nid  !email  !phone || !pass) {
    return res.status(400).json({ error: 'يرجى ملء جميع الحقول المطلوبة' });
  }
  const joinDate = new Date().toLocaleDateString('ar-DZ');
  const stmt = db.prepare(`INSERT INTO users (first, last, nid, email, phone, pass, join_date) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  stmt.run([first, last, nid, email, phone, pass, joinDate], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'البريد الإلكتروني هذا مسجل بالفعل' });
      }
      return res.status(500).json({ error: 'حدث خطأ في التسجيل' });
    }
    res.json({ user: { id: this.lastID, first, last, nid, email, phone, join_date: joinDate } });
  });
  stmt.finalize();
});

app.post('/api/login', (req, res) => {
  const { email, pass } = req.body;
  if (!email || !pass) {
    return res.status(400).json({ error: 'أدخل البريد الإلكتروني وكلمة المرور' });
  }
  db.get(`SELECT id, first, last, nid, email, phone, pass, join_date FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) return res.status(500).json({ error: 'حدث خطأ في تسجيل الدخول' });
    if (!user || user.pass !== pass) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    delete user.pass;
    res.json({ user });
  });
});

app.get('/api/requests/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'معرّف المستخدم غير صالح' });
  db.all(`SELECT * FROM requests WHERE user_id = ? ORDER BY id ASC`, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'فشل في تحميل الطلبات' });
    if (!rows.length) return res.json({ requests: [] });
    const requestIds = rows.map(r => r.id);
    const placeholders = requestIds.map(() => '?').join(',');
    db.all(`SELECT * FROM request_files WHERE request_id IN (${placeholders})`, requestIds, (err2, files) => {
      if (err2) return res.status(500).json({ error: 'فشل في تحميل ملفات الطلبات' });
      const filesByRequest = files.reduce((acc, file) => {
        if (!acc[file.request_id]) acc[file.request_id] = [];
        acc[file.request_id].push({ name: file.name, type: file.type, size: file.size });
        return acc;
      }, {});
      const result = rows.map(r => ({ ...r, files: filesByRequest[r.id] || [] }));
      res.json({ requests: result });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});