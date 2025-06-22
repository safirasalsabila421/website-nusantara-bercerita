// 1. Impor paket-paket yang dibutuhkan
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// 2. Inisialisasi dan Konfigurasi Dasar
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kunci-rahasia-default-untuk-lokal';
const saltRounds = 10;

app.use(cors());
app.use(express.json());

// 3. Path ke File Database
const usersDbPath = './users.json';
const storiesDbPath = './stories.json';

// 4. Middleware untuk Otentikasi Token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// 5. Fungsi Bantuan untuk Membaca/Menulis File
function readData(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
        console.error(`Gagal membaca file ${filePath}:`, error);
        return [];
    }
}
function writeUsers(data) {
    fs.writeFileSync(usersDbPath, JSON.stringify(data, null, 2));
}

// 6. Rute atau Endpoint API

// Endpoint untuk cek server
app.get('/', (req, res) => {
    res.send('<h1>Server backend Nusantara Bercerita aktif!</h1>');
});

// === PERBAIKAN: Mengisi kembali endpoint registrasi dan login ===
app.post('/register', async (req, res) => {
    const users = readData(usersDbPath);
    const { fullname, email, password } = req.body;
    if (!fullname || !email || !password) return res.status(400).json({ message: 'Semua field harus diisi!' });
    if (users.find(user => user.email === email)) return res.status(400).json({ message: 'Email sudah terdaftar!' });
    
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = { id: Date.now(), fullname, email, password: hashedPassword, phoneNumber: "", favorites: [] };
    users.push(newUser);
    writeUsers(users);
    res.status(201).json({ message: 'Registrasi berhasil!' });
});

app.post('/login', async (req, res) => {
    const users = readData(usersDbPath);
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ message: 'Email tidak ditemukan.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Password salah.' });
    
    const token = jwt.sign({ id: user.id, fullname: user.fullname }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login berhasil!', token, user: { fullname: user.fullname } });
});

// Endpoint Cerita
app.get('/api/stories/:id', (req, res) => {
    const stories = readData(storiesDbPath);
    const story = stories.find(s => s.id === req.params.id);
    if (story) res.json(story);
    else res.status(404).json({ message: 'Cerita tidak ditemukan' });
});

// === PERBAIKAN: Mengisi kembali endpoint profil dan ganti password ===
app.get('/api/profile', authenticateToken, (req, res) => {
    const users = readData(usersDbPath);
    const currentUser = users.find(u => u.id === req.user.id);
    if (!currentUser) return res.status(404).json({ message: 'Pengguna tidak ditemukan' });
    res.json({ fullname: currentUser.fullname, email: currentUser.email, phoneNumber: currentUser.phoneNumber || "" });
});

app.put('/api/profile', authenticateToken, (req, res) => {
    const users = readData(usersDbPath);
    const { fullname, email, phoneNumber } = req.body;
    const userIndex = users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ message: 'Pengguna tidak ditemukan' });
    
    users[userIndex].fullname = fullname;
    users[userIndex].email = email;
    users[userIndex].phoneNumber = phoneNumber;
    writeUsers(users);
    res.json({ message: 'Profil berhasil diperbarui!', user: { fullname, email, phoneNumber } });
});

app.put('/api/password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ message: 'Semua field password harus diisi.' });
    const users = readData(usersDbPath);
    const userIndex = users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    const user = users[userIndex];
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Password lama tidak cocok.' });
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
    users[userIndex].password = hashedNewPassword;
    writeUsers(users);
    res.json({ message: 'Password berhasil diubah.' });
});

// Endpoint untuk Fitur Cerita Favorit
app.get('/api/favorites/status/:storyId', authenticateToken, (req, res) => {
    const users = readData(usersDbPath);
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Pengguna tidak ditemukan" });
    const isFavorited = user.favorites.includes(req.params.storyId);
    res.json({ isFavorited });
});
app.post('/api/favorites/:storyId', authenticateToken, (req, res) => {
    const users = readData(usersDbPath);
    const userIndex = users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).send();
    const storyId = req.params.storyId;
    if (!users[userIndex].favorites.includes(storyId)) {
        users[userIndex].favorites.push(storyId);
        writeUsers(users);
    }
    res.json({ message: 'Berhasil ditambahkan ke favorit' });
});
app.delete('/api/favorites/:storyId', authenticateToken, (req, res) => {
    const users = readData(usersDbPath);
    const userIndex = users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).send();
    const storyId = req.params.storyId;
    users[userIndex].favorites = users[userIndex].favorites.filter(id => id !== storyId);
    writeUsers(users);
    res.json({ message: 'Berhasil dihapus dari favorit' });
});
app.get('/api/favorites', authenticateToken, (req, res) => {
    const users = readData(usersDbPath);
    const stories = readData(storiesDbPath);
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Pengguna tidak ditemukan" });
    const favoriteStories = stories.filter(story => user.favorites.includes(story.id));
    res.json(favoriteStories);
});

// 7. Menjalankan Server
app.listen(PORT, () => {
    console.log(`Server backend berjalan di http://localhost:${PORT}`);
});