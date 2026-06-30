FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Data directory — mounted as a Fly.io volume for SQLite persistence
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "start"]
