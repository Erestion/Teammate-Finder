# 1. Беремо легку версію Node.js
FROM node:18-alpine

# 2. Створюємо папку всередині контейнера
WORKDIR /app

# 3. Копіюємо файли пакетів і встановлюємо залежності
COPY package*.json ./
RUN npm install

# 4. Копіюємо весь код проекту
COPY . /app

# 5. Робимо білд фронтенду
RUN npm run build

# 6. Відкриваємо порт 4000
EXPOSE 4000

# 7. Запускаємо сервер
CMD ["node", "server.js"]