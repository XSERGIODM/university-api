// Importar el módulo Express para crear el servidor web
const express = require('express');

// Importar el módulo HTTP para crear servidor
const http = require('http');

// Importar el módulo HTTPS para crear servidor seguro (solo en producción sin proxy)
const https = require('https');

// Importar el módulo fs para leer archivos de certificados
const fs = require('fs');

// Importar el módulo CORS para permitir solicitudes desde otros dominios
const cors = require('cors');

// Importar helmet para headers de seguridad
const helmet = require('helmet');

// Importar express-rate-limit para limitar peticiones
const rateLimit = require('express-rate-limit');

// Importar las funciones del scraper
const { loginToPortal, navigateToGrades, extractGrades, extractSchedule } = require('./scraper');

// Crear una instancia de la aplicación Express
const app = express();

// Definir el puerto en el que el servidor escuchará las peticiones
const PORT = process.env.PORT || 3000;

// Detectar si está detrás de un proxy reverso
const isBehindProxy = process.env.NODE_ENV === 'production' || process.env.BEHIND_PROXY === 'true';

// Configurar trust proxy si está detrás de un proxy
if (isBehindProxy) {
    app.set('trust proxy', 1);
}

// Middleware para parsear JSON en las peticiones entrantes
app.use(express.json());

// Middleware CORS para permitir solicitudes desde otros dominios
app.use(cors());

// Middleware Helmet para headers de seguridad
app.use(helmet());

// Middleware Rate Limiting: 100 peticiones por 15 minutos por IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // límite de 100 peticiones por ventana
    message: {
        error: 'Too Many Requests',
        message: 'Demasiadas peticiones desde esta IP, por favor intenta más tarde.'
    },
    standardHeaders: true, // Retornar rate limit info en los headers `RateLimit-*`
    legacyHeaders: false, // Deshabilitar los headers `X-RateLimit-*`
});
app.use(limiter);

// Función de validación de entrada
function validateInput(input, fieldName) {
    if (!input || typeof input !== 'string') {
        return { valid: false, message: `${fieldName} debe ser una cadena de texto` };
    }

    const minLength = 3;
    const maxLength = 50;
    const allowedChars = /^[a-zA-Z0-9@._-]+$/; // Alfanumérico + @ . _ -

    if (input.length < minLength) {
        return { valid: false, message: `${fieldName} debe tener al menos ${minLength} caracteres` };
    }

    if (input.length > maxLength) {
        return { valid: false, message: `${fieldName} no puede tener más de ${maxLength} caracteres` };
    }

    if (!allowedChars.test(input)) {
        return { valid: false, message: `${fieldName} contiene caracteres no permitidos. Solo se permiten letras, números, @, ., _ y -` };
    }

    return { valid: true };
}

// Ruta básica de prueba para verificar que el servidor funciona
app.get('/', (req, res) => {
    res.json({ message: '¡Bienvenido a la API de la Universidad!' });
});

// Ruta de ejemplo para obtener información de estudiantes
app.get('/students', (req, res) => {
    // Aquí iría la lógica para obtener estudiantes de una base de datos
    res.json([
        { id: 1, name: 'Juan Pérez', career: 'Ingeniería' },
        { id: 2, name: 'María García', career: 'Medicina' }
    ]);
});

// Endpoint RESTful POST /api/data para obtener datos de la universidad
app.post('/api/data', async (req, res) => {
    try {
        // Validar parámetros del body JSON
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Los campos username y password son requeridos en el body JSON'
            });
        }

        // Validar entrada de username
        const usernameValidation = validateInput(username, 'Username');
        if (!usernameValidation.valid) {
            return res.status(400).json({
                error: 'Bad Request',
                message: usernameValidation.message
            });
        }

        // Validar entrada de password
        const passwordValidation = validateInput(password, 'Password');
        if (!passwordValidation.valid) {
            return res.status(400).json({
                error: 'Bad Request',
                message: passwordValidation.message
            });
        }

        // No loguear credenciales por seguridad
        console.log('Iniciando proceso de scraping para usuario:', username.substring(0, 3) + '***');

        let browser, context, page;

        try {
            // Paso 1: Login al portal
            console.log('Intentando login...');
            const loginResult = await loginToPortal(username, password);
            context = loginResult.context;
            page = loginResult.page;
            browser = context.browser();

            // Paso 2: Navegar a la sección de notas
            console.log('Navegando a la sección de notas...');
            await navigateToGrades(page);

            // Paso 3: Extraer notas
            console.log('Extrayendo notas...');
            const grades = await extractGrades(page);

            // Paso 4: Navegar y extraer horarios (asumiendo que hay una página de horarios)
            // Nota: El scraper actual no tiene función para navegar a horarios, así que extraemos del mismo lugar
            console.log('Extrayendo horarios...');
            const schedule = await extractSchedule(page);

            // Retornar respuesta exitosa
            res.status(200).json({
                grades: grades,
                schedule: schedule
            });

        } catch (scraperError) {
            console.error('Error en el proceso de scraping:', scraperError.message);

            // Determinar código de error basado en el tipo de error
            if (scraperError.message.includes('Credenciales') || scraperError.message.includes('login')) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Credenciales incorrectas o login fallido'
                });
            } else if (scraperError.message.includes('Timeout') || scraperError.message.includes('tiempo')) {
                return res.status(408).json({
                    error: 'Request Timeout',
                    message: 'Timeout durante el proceso de scraping'
                });
            } else if (scraperError.message.includes('net::ERR') || scraperError.message.includes('red')) {
                return res.status(502).json({
                    error: 'Bad Gateway',
                    message: 'Error de conexión con el servidor de la universidad'
                });
            } else {
                return res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Error interno durante la extracción de datos'
                });
            }
        } finally {
            // Asegurar cierre del navegador
            try {
                if (context) await context.close();
                if (browser) await browser.close();
            } catch (closeError) {
                console.error('Error cerrando navegador:', closeError.message);
            }
        }

    } catch (error) {
        console.error('Error general en el endpoint:', error.message);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Error interno del servidor'
        });
    }
});

// Determinar si usar HTTP o HTTPS basado en la configuración
let server;

if (isBehindProxy) {
    // Usar HTTP cuando está detrás de un proxy reverso
    server = http.createServer(app);
    server.listen(PORT, () => {
        console.log(`Servidor HTTP corriendo en http://localhost:${PORT}`);
        console.log('Nota: El servidor está configurado para usar HTTP detrás de un proxy reverso.');
    });
} else {
    // Usar HTTPS en desarrollo local sin proxy
    const httpsOptions = {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem')
    };

    server = https.createServer(httpsOptions, app);
    server.listen(PORT, () => {
        console.log(`Servidor HTTPS corriendo en https://localhost:${PORT}`);
        console.log('Nota: El certificado es auto-firmado, por lo que el navegador mostrará una advertencia de seguridad.');
    });
}

// Exportar la aplicación para posibles pruebas o uso en otros módulos
module.exports = app;