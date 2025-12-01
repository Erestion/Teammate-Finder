# 1. Беремо легку версію Node.js
FROM node:18-alpine

# 2. Створюємо папку всередині контейнера
WORKDIR /app

# 3. Копіюємо файли пакетів і встановлюємо залежності
COPY package*.json ./
RUN npm install 

RUN VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID} 


# 4. Копіюємо весь код проекту
COPY . .

# 5. Робимо білд фронтенду (всередині контейнера)
RUN VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID} npm run build

# 6. Відкриваємо порт 4000 (внутрішній)
EXPOSE 4000

# 7. Запускаємо сервер
CMD ["node", "server.js"]