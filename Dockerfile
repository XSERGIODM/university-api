# Usar imagen base de Node.js con Debian Bookworm
FROM node:20-bookworm

# Instalar dependencias del sistema necesarias para Playwright
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libc6 \
    libcairo-gobject2 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json primero para aprovechar cache de Docker
COPY package*.json ./

# Instalar dependencias de Node.js
RUN npm ci --only=production

# Instalar Playwright y sus navegadores
RUN npx playwright install --with-deps

# Copiar el resto de los archivos de la aplicación
COPY . .

# Exponer el puerto que usa la aplicación (3000 por defecto)
EXPOSE 3000

# Comando para ejecutar la aplicación
CMD ["npm", "start"]