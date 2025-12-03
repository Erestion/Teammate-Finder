# 1. Беремо легку версію Node.js
FROM node:18-alpine

# 2. Створюємо папку всередині контейнера
WORKDIR /app

# 3. Копіюємо файли пакетів і встановлюємо залежності
COPY package*.json ./
RUN npm install

# 4. Копіюємо весь код проекту
# (Додали /app для надійності, хоча WORKDIR це вже робить)
COPY . /app

# 5. Робимо білд фронтенду (Передаємо змінну, щоб вона запеклась у білд)
RUN VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID npm run build

# 6. Відкриваємо порт 4000
EXPOSE 4000

# 7. Запускаємо сервер (sh -c іноді допомагає з кешуванням змінних, але node server.js теж ок)
CMD ["node", "server.js"]