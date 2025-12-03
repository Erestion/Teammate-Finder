require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');

// Імпортуємо моделі
const User = require('./models/User');
const Ad = require('./models/Ad');
const Chat = require('./models/Chat');
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || process.env.VITE_API_URL || '*';
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: FRONTEND_ORIGIN,
        methods: ["GET", "POST"],
        credentials: true,
    }
});

app.use(cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // Ваш Client ID
const indexPath = path.join(__dirname, 'dist', 'index.html');

let cachedHtml = '';

try {
    const originalHtml = fs.readFileSync(indexPath, 'utf8');
    // Інжекція: замінюємо тег-плейсхолдер на реальний скрипт
    cachedHtml = originalHtml.replace(
        '<script id="client-id-placeholder"></script>',
        `<script>window.GOOGLE_CLIENT_ID = '${CLIENT_ID}';</script>`
    );
    console.log("✅ HTML з Client ID успішно кешовано!");
} catch (e) {
    console.error("❌ ПОМИЛКА ЧИТАННЯ index.html:", e.message);
}

// --- ПІДКЛЮЧЕННЯ ДО MONGODB ATLAS ---
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ База Даних підключена успішно!'))
    .catch(err => {
        console.error('❌ Помилка підключення до БД:', err.message);
    });
    
// --- API ROUTES (Маршрути) ---

// 1. Реєстрація нового користувача
app.post('/api/register', async (req, res) => {
    try {
        console.log("📥 Отримано запит на реєстрацію:", req.body.username); // Лог в консоль

        const { username, password } = req.body;
		const email = req.body.email.toLowerCase();

        // Перевірка: чи є вже такий юзер?
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'Користувач з таким email або ім\'ям вже існує' });
        }

        // Створення нового користувача
        const newUser = new User({
            username,
            email,
            password, // У майбутньому сюди додамо хешування (bcrypt)
            profile: {
                bio: "Новий користувач",
                skills: []
            }
        });

        await newUser.save(); // Зберігаємо в MongoDB Atlas

        console.log(`✅ Успішно створено юзера: ${username}`);
        res.status(201).json({ message: 'Користувач успішно створений!',
		                       userId: newUser._id,
		                       username: newUser.username,
							   isAdmin: newUser.isAdmin,
							   profile: newUser.profile
							   });

    } catch (error) {
        console.error("❌ Помилка реєстрації:", error);
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// 2. Отримання профілю (для перевірки сесії)
app.get('/api/users/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ message: 'Користувача не знайдено' });
        
        // --- ВИПРАВЛЕНА ВІДПОВІДЬ СЕРВЕРА ---
        res.json({
            _id: user._id, // <--- ДОДАНО ID
            username: user.username,
            email: user.email,
            profile: user.profile,
            isAdmin: user.isAdmin // <--- ДОДАНО СТАТУС АДМІНА
        });
    } catch (error) {
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// 2. Вхід користувача (Login)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
		const email = req.body.email.toLowerCase();

        // Шукаємо користувача по пошті
        const user = await User.findOne({ email });

        // Якщо користувача немає АБО пароль не співпадає
        // (Примітка: в реальності паролі треба порівнювати через bcrypt, але поки у нас пряме порівняння)
        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Невірний email або пароль' });
        }

        console.log(`✅ Користувач увійшов: ${user.username}`);
        
        // Повертаємо дані, які потрібні фронтенду
        res.json({
            message: 'Вхід успішний',
            userId: user._id,
            username: user.username,
			isAdmin: user.isAdmin,
            profile: user.profile
        });

    } catch (error) {
        console.error("Помилка входу:", error);
        res.status(500).json({ message: 'Помилка сервера' });
    }
});



// 3. Оновлення профілю (PUT)
app.put('/api/users/:userId', async (req, res) => {
    try {
        const { bio, skills } = req.body;
        const userId = req.params.userId;

        // Знаходимо юзера і оновлюємо поля
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { 
                "profile.bio": bio, 
                "profile.skills": skills // Очікуємо масив рядків
            }, 
            { new: true } // Ця опція повертає вже ОНОВЛЕНИЙ документ
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "Користувача не знайдено" });
        }

        console.log(`📝 Профіль оновлено для: ${updatedUser.username}`);
        
        res.json({ 
            message: "Профіль оновлено", 
            user: {
                id: updatedUser._id,
                username: updatedUser.username,
                profile: updatedUser.profile
            }
        });

    } catch (error) {
        console.error("Помилка оновлення:", error);
        res.status(500).json({ message: "Помилка сервера" });
    }
});

const { OAuth2Client } = require('google-auth-library');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// 4. Вхід через Google
app.post('/api/google-login', async (req, res) => {
    try {
        const { token } = req.body;

        // Перевіряємо токен через Google
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        
        const payload = ticket.getPayload();
        const { email, name, picture } = payload;

        // Шукаємо користувача в нашій базі
        let user = await User.findOne({ email });

        if (!user) {
            // Якщо немає - створюємо нового
            // Генеруємо випадковий пароль, бо він заходить через Google
            const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
            
            user = new User({
                username: name, // Google ім'я
                email: email,
                password: randomPassword,
                profile: {
                    bio: "Joined via Google",
                    skills: [],
                    avatarUrl: picture // <-- Зберігаємо гугл-аватарку!
                }
            });
            await user.save();
            console.log(`🆕 Новий Google-юзер: ${name}`);
        } else {
            console.log(`✅ Google вхід: ${user.username}`);
        }

        // Віддаємо дані клієнту (так само, як при звичайному вході)
        res.json({
            message: 'Вхід успішний',
            userId: user._id,
            username: user.username,
            isAdmin: user.isAdmin,
            profile: user.profile
        });

    } catch (error) {
        console.error("Google Auth Error:", error);
        res.status(401).json({ message: "Не вдалося увійти через Google" });
    }
});

// --- ЛОГІКА ОГОЛОШЕНЬ (POSTS) ---

// 1. Отримати всі пости (GET)
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await Ad.find()
            .sort({ createdAt: -1 }) // Нові зверху
            .populate('author', 'username profile'); // Підтягуємо дані автора

        res.json(posts);
    } catch (error) {
        console.error("Помилка отримання постів:", error);
        res.status(500).json({ message: "Помилка сервера" });
    }
});

// 2. Створити новий пост (POST)
app.post('/api/posts', async (req, res) => {
    try {
        // Отримуємо всі дані з форми + ID автора
        const { title, game, desc, level, lang, platform, time, tags, userId } = req.body;

        const newAd = new Ad({
            author: userId,
            title,
            game,
            desc,
            level,
            lang,
            platform,
            time,
            tags
        });

        await newAd.save();

        // Повертаємо готовий пост з даними автора
        const populatedAd = await newAd.populate('author', 'username profile');
        console.log(`📢 Новий пост: ${title}`);
        res.status(201).json(populatedAd);

    } catch (error) {
        console.error("Помилка створення:", error);
        res.status(500).json({ message: "Не вдалося створити пост" });
    }
});

// 3. Видалити пост (DELETE)
app.delete('/api/posts/:id', async (req, res) => {
    try {
        const result = await Ad.findByIdAndDelete(req.params.id);
        if (!result) return res.status(404).json({ message: "Пост не знайдено" });

        console.log(`🗑️ Пост видалено: ${req.params.id}`);
        res.json({ message: "Успішно видалено" });
    } catch (error) {
        console.error("Помилка видалення:", error);
        res.status(500).json({ message: "Помилка сервера" });
    }
});

// 4. Редагувати пост (PUT)
app.put('/api/posts/:id', async (req, res) => {
    try {
        const { title, game, desc, level, lang, platform, time, tags } = req.body;
        
        // Оновлюємо пост
        const updatedPost = await Ad.findByIdAndUpdate(
            req.params.id,
            {
                title, game, desc, level, lang, platform, time, tags
            },
            { new: true } // Повернути оновлений варіант
        ).populate('author', 'username profile'); // Не забуваємо підтягнути автора

        if (!updatedPost) return res.status(404).json({ message: "Пост не знайдено" });

        console.log(`✏️ Пост оновлено: ${title}`);
        res.json(updatedPost);

    } catch (error) {
        console.error("Помилка редагування:", error);
        res.status(500).json({ message: "Помилка сервера" });
    }
});

// 5. Поставити/Прибрати Лайк (Toggle Like)
app.put('/api/posts/:id/like', async (req, res) => {
    try {
        const { userId } = req.body;
        const postId = req.params.id;

        const post = await Ad.findById(postId);
        if (!post) return res.status(404).json({ message: "Пост не знайдено" });

        // Перевіряємо, чи вже лайкнув цей юзер
        const index = post.likes.indexOf(userId);

        if (index === -1) {
            // Немає в списку -> Додаємо (Лайк)
            post.likes.push(userId);
        } else {
            // Є в списку -> Видаляємо (Дизлайк)
            post.likes.splice(index, 1);
        }

        await post.save();
        
        // Повертаємо оновлений пост з даними автора
        const populatedPost = await post.populate('author', 'username profile');
        res.json(populatedPost);

    } catch (error) {
        console.error("Помилка лайка:", error);
        res.status(500).json({ message: "Помилка сервера" });
    }
});

// --- ЛОГІКА ЧАТІВ ---

// 1. Почати чат (або отримати існуючий)
app.post('/api/chats', async (req, res) => {
    try {
        const { adId, userId } = req.body; // adId - ID оголошення, userId - хто натиснув кнопку

        // 1. Знаходимо оголошення, щоб дізнатися хто Автор
        const ad = await Ad.findById(adId);
        if (!ad) return res.status(404).json({ message: "Оголошення не знайдено" });

        const authorId = ad.author.toString();

        // Якщо я намагаюся написати сам собі
        if (authorId === userId) {
            return res.status(400).json({ message: "Ви не можете писати самі собі" });
        }

        // 2. Шукаємо, чи вже є чат між цими двома по цьому оголошенню
        let chat = await Chat.findOne({
            relatedAd: adId,
            participants: { $all: [userId, authorId] }
        })
        .populate('participants', 'username profile') // Підтягуємо інфо про людей
        .populate('messages.sender', 'username');     // Підтягуємо імена в повідомленнях

        // 3. Якщо чату немає - створюємо новий
        if (!chat) {
            chat = new Chat({
                relatedAd: adId,
                participants: [userId, authorId],
                messages: []
            });
            await chat.save();
            // Знову робимо populate, щоб повернути гарні дані
            chat = await chat.populate('participants', 'username profile');
        }

        console.log(`💬 Чат відкрито для оголошення: ${ad.title}`);
        res.json(chat);

    } catch (error) {
        console.error("Помилка чату:", error);
        res.status(500).json({ message: "Помилка сервера" });
    }
});

// 2. Відправити повідомлення в чат (ОНОВЛЕНО ЗІ СПОВІЩЕННЯМ)
app.post('/api/chats/:chatId/messages', async (req, res) => {
    try {
        const { text, senderId } = req.body;
        
        const chat = await Chat.findById(req.params.chatId);
        if (!chat) return res.status(404).json({ message: "Чат не знайдено" });

        const newMessage = {
            sender: senderId,
            text: text,
            timestamp: new Date()
        };

        chat.messages.push(newMessage);
        chat.lastUpdated = new Date();
        await chat.save();

        const updatedChat = await Chat.findById(chat._id)
             .populate('messages.sender', 'username');

        // 1. Оновлюємо відкритий чат (якщо хтось дивиться прямо зараз)
        io.emit(`chat:${chat._id}`, updatedChat.messages);

        // --- НОВЕ: СПОВІЩЕННЯ ---
        // Знаходимо ID отримувача (це той учасник, який НЕ є відправником)
        const recipientId = chat.participants.find(p => p.toString() !== senderId);
        
        if (recipientId) {
            // Відправляємо сигнал особисто отримувачу
            io.emit(`notification:${recipientId}`, {
                text: "Нове повідомлення!",
                senderName: updatedChat.messages[updatedChat.messages.length - 1].sender.username
            });
            console.log(`🔔 Сповіщення відправлено для ${recipientId}`);
        }

        res.json(newMessage);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Помилка відправки" });
    }
});

// 3. Отримати список чатів (Inbox) - ВИПРАВЛЕНА ВЕРСІЯ
app.get('/api/chats/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Знаходимо чати, де користувач є учасником
        const chats = await Chat.find({ 
            participants: userId 
        })
        .populate({
            path: 'participants',
            select: 'username profile email' // Беремо тільки потрібні поля
        })
        .populate('relatedAd', 'title') // Назва оголошення
        .sort({ lastUpdated: -1 }); // Свіжі зверху

        console.log(`📂 Знайдено чатів для ${userId}: ${chats.length}`);
        res.json(chats);

    } catch (error) {
        console.error("Помилка завантаження чатів:", error);
        res.status(500).json({ message: "Помилка сервера" });
    }
});

// --- SOCKET.IO ЛОГІКА (ЧАТ) ---
io.on('connection', (socket) => {
    // Тимчасова логіка (поки не прив'язали до БД)
    socket.on('chat message', (data) => {
        const msgWithTime = {
            ...data,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        io.emit('chat message', msgWithTime);
    });
});

app.use(express.static(path.join(__dirname, 'dist'), { index: false }));

app.use((req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');

    // 1. Читаємо файл кожного разу при запиті (це надійно і швидко для Node.js)
    fs.readFile(indexPath, 'utf8', (err, htmlContent) => {
        if (err) {
            console.error('❌ Error reading index.html:', err);
            return res.status(500).send('Server Error');
        }

        // 2. Отримуємо ID (з бекапу, якщо головна змінна раптом підведе)
        const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;

        if (!clientId) {
             console.error("⚠️ УВАГА: GOOGLE_CLIENT_ID не знайдено на сервері!");
        }

        // 3. Надійна інжекція: вставляємо перед </head>
        // Ми не шукаємо спеціальний id, ми просто додаємо скрипт у кінець хедеру.
        const finalHtml = htmlContent.replace(
            '</head>',
            `<script>window.GOOGLE_CLIENT_ID = "${clientId}";</script></head>`
        );

        // 4. Відправляємо модифікований HTML
        res.send(finalHtml);
    });
});

// Запуск сервера
const PORT = process.env.PORT || 4000;


server.listen(PORT, () => {
    console.log(`🚀 Сервер працює на http://localhost:${PORT}`);
});