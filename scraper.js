// Importar Playwright para automatizar el navegador
const { chromium } = require('playwright');

// Configuración robusta del navegador para evitar timeouts y mejorar navegación
const BROWSER_CONFIG = {
    headless: true,
    ignoreHTTPSErrors: true, // Ignorar errores de certificado HTTPS
    args: [
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
    ]
};

// Configuración del contexto del navegador
const CONTEXT_CONFIG = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
    },
    navigationTimeout: 120000, // 2 minutos para navegación
    actionTimeout: 30000 // 30 segundos para acciones
};

// Función asíncrona para realizar scraping de una página web
async function scrapeUniversityData(url) {
    // Lanzar una instancia del navegador Chromium con configuración robusta
    const browser = await chromium.launch(BROWSER_CONFIG);

    // Crear un nuevo contexto con configuración avanzada
    const context = await browser.newContext(CONTEXT_CONFIG);

    // Crear una nueva página en el contexto configurado
    const page = await context.newPage();

    try {
        // Navegar a la URL especificada
        await page.goto(url);

        // Esperar a que la página cargue completamente
        await page.waitForLoadState('networkidle');

        // Extraer datos específicos de la página usando selectores CSS
        // Ejemplo: obtener títulos de noticias o información de cursos
        const titles = await page.$$eval('h2', elements =>
            elements.map(el => el.textContent.trim())
        );

        // Extraer enlaces de la página
        const links = await page.$$eval('a', elements =>
            elements.map(el => ({ text: el.textContent.trim(), href: el.href }))
        );

        // Retornar los datos extraídos
        return {
            url: url,
            titles: titles,
            links: links.slice(0, 10) // Limitar a los primeros 10 enlaces
        };

    } catch (error) {
        // Manejar errores durante el scraping
        console.error('Error durante el scraping:', error.message);
        return { error: error.message };
    } finally {
        // Cerrar el contexto y el navegador para liberar recursos
        await context.close();
        await browser.close();
    }
}

// Función para scrapear múltiples URLs
async function scrapeMultiplePages(urls) {
    const results = [];

    // Procesar cada URL de manera secuencial
    for (const url of urls) {
        console.log(`Scrapeando: ${url}`);
        const data = await scrapeUniversityData(url);
        results.push(data);

        // Pequeña pausa entre solicitudes para ser respetuoso con el servidor
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
}

// Función asíncrona para simular el login en el portal universitario
// Utiliza Playwright para automatizar el proceso de autenticación
async function loginToPortal(username, password) {
    // Lanzar una instancia del navegador Chromium con configuración robusta
    // El modo headless permite ejecutar el navegador sin interfaz gráfica
    const browser = await chromium.launch(BROWSER_CONFIG);

    // Crear un nuevo contexto de navegador con configuración avanzada para mantener la sesión aislada
    // Esto permite manejar cookies y estado de sesión por separado
    const context = await browser.newContext(CONTEXT_CONFIG);

    // Crear una nueva página dentro del contexto
    const page = await context.newPage();

    try {
        // Navegar a la página de login del portal universitario
        // Usar configuración robusta para manejar conexiones lentas y certificados HTTPS
        await page.goto('https://chaira.uniamazonia.edu.co/Chaira/Logon.aspx', {
            waitUntil: 'networkidle',
            timeout: 120000 // Aumentado a 2 minutos
        });

        // Completar el campo de usuario
        // Usar el selector específico del formulario
        await page.fill('#txt_usuario', username);

        // Completar el campo de contraseña
        await page.fill('#txt_password', password);

        // Completar campos de ubicación geográfica
        // pLat: latitud, pLog: longitud, pDis: distancia
        await page.evaluate(() => {
            document.querySelector('input[name="pLat"]').value = '-1.2195'; // Latitud aproximada de Florencia, Caquetá
        });
        await page.evaluate(() => {
            document.querySelector('input[name="pLog"]').value = '-75.6483'; // Longitud aproximada de Florencia, Caquetá
        });
        await page.evaluate(() => {
            document.querySelector('input[name="pDis"]').value = '0'; // Distancia por defecto
        });

        // Verificar si hay un CAPTCHA presente en la página
        // Buscar imágenes que contengan 'captcha' en su fuente
        const captchaPresent = await page.locator('img[src*="captcha"]').count() > 0;

        if (captchaPresent) {
            // Si hay CAPTCHA, pausar la ejecución para entrada manual
            // En un entorno de producción, se podría integrar un servicio de resolución de CAPTCHA
            console.log('CAPTCHA detectado. Por favor, resuélvalo manualmente en el navegador.');
            console.log('Presione Enter en la consola para continuar después de resolver el CAPTCHA...');

            // Pausar la ejecución esperando entrada del usuario
            // Esto es una solución simple; en producción usar servicios como 2Captcha
            await new Promise(resolve => {
                process.stdin.once('data', () => resolve());
            });
        }

        // Enviar el formulario de login
        // Buscar el botón de submit por tipo
        await page.click('input[type="submit"]');

        // Esperar a que la página cargue después del login con timeout aumentado
        await page.waitForLoadState('networkidle', { timeout: 60000 });

        // Verificar si el login fue exitoso
        // Buscar cookies .ASPXAUTH o TokenApiChaira, o cambio de URL a /View/Private/Desktop.aspx
        const cookies = await context.cookies();
        const hasAspxAuth = cookies.some(cookie => cookie.name === '.ASPXAUTH');
        const hasTokenApiChaira = cookies.some(cookie => cookie.name === 'TokenApiChaira');
        const urlChanged = await page.url().includes('/View/Private/Desktop.aspx');

        const loginSuccess = hasAspxAuth || hasTokenApiChaira || urlChanged;

        if (!loginSuccess) {
            // Verificar si hay mensajes de error de login
            const errorMessage = await page.locator('text=Usuario o contraseña incorrectos').count() > 0 ||
                                await page.locator('text=Credenciales inválidas').count() > 0;

            if (errorMessage) {
                throw new Error('Credenciales de login incorrectas');
            } else {
                throw new Error('Login fallido: no se pudo verificar el éxito del login');
            }
        }

        // Retornar el contexto del navegador para mantener la sesión activa
        // El llamador es responsable de cerrar el navegador cuando termine
        return { context, page };

    } catch (error) {
        // Manejar errores específicos de Playwright y generales
        if (error.name === 'TimeoutError') {
            throw new Error('Timeout durante el proceso de login: ' + error.message);
        } else if (error.message.includes('net::ERR')) {
            throw new Error('Error de red durante el login: ' + error.message);
        } else {
            throw new Error('Error durante el login: ' + error.message);
        }
    }
    // Nota: No cerrar el navegador aquí para mantener la sesión activa
    // El llamador debe manejar el cierre con context.close() y browser.close()
}

// Función asíncrona para navegar al dashboard y acceder a la sección de notas
// Esta función asume que la página ya está logueada y mantiene la sesión activa
async function navigateToGrades(page) {
    try {
        // Paso 1: Navegar al dashboard
        // Usar la URL correcta del dashboard según feedback del usuario
        console.log('Navegando al dashboard...');
        await page.goto('https://chaira.uniamazonia.edu.co/Chaira/View/Private/Desktop.aspx', {
            waitUntil: 'networkidle',
            timeout: 120000 // Aumentado a 2 minutos
        });

        // Esperar a que el dashboard cargue completamente, incluyendo contenido dinámico
        await page.waitForLoadState('networkidle', { timeout: 120000 });

        // Verificar que se haya cargado el dashboard correctamente
        // Buscar elementos característicos del dashboard
        const dashboardLoaded = await page.locator('text=Dashboard').count() > 0 ||
                                await page.locator('text=Panel').count() > 0 ||
                                await page.url().includes('Dashboard');

        if (!dashboardLoaded) {
            throw new Error('No se pudo verificar la carga del dashboard');
        }

        console.log('Dashboard cargado exitosamente.');

        // Paso 2: Acceder a la sección de notas
        // Usar el selector ExtJS específico proporcionado por el usuario
        console.log('Accediendo a la sección de notas...');
        try {
            // Usar el selector ExtJS específico para el menú de notas
            const notasMenuItem = page.locator('#x-menu-el-Item1131261728');

            // Verificar que el elemento existe y contiene el texto correcto
            const menuText = await notasMenuItem.textContent();
            if (menuText && menuText.trim().includes('Notas Actuales')) {
                await notasMenuItem.click();
            } else {
                throw new Error('El selector ExtJS no contiene el texto esperado "Notas Actuales"');
            }
        } catch (extjsError) {
            // Si el selector ExtJS falla, intentar fallback con URL directa
            console.log('Selector ExtJS falló, intentando URL directa...');
            try {
                await page.goto('https://chaira.uniamazonia.edu.co/Chaira/Notas.aspx', {
                    waitUntil: 'networkidle',
                    timeout: 120000 // Aumentado a 2 minutos
                });
            } catch (directUrlError) {
                // Si la URL directa también falla, buscar enlace con texto "Notas"
                console.log('URL directa no funcionó, buscando enlace de Notas...');
                const notasLink = page.locator('a:has-text("Notas")').or(
                    page.locator('a:has-text("Calificaciones")')
                ).or(
                    page.locator('a:has-text("Grades")')
                );

                const linkCount = await notasLink.count();
                if (linkCount > 0) {
                    await notasLink.first().click();
                } else {
                    throw new Error('No se encontró enlace a la sección de notas');
                }
            }
        }

        // Esperar a que la página de notas cargue completamente
        await page.waitForLoadState('networkidle', { timeout: 120000 });

        // Verificar que se haya accedido correctamente a la sección de notas
        // Buscar elementos característicos de la sección de notas
        const notasLoaded = await page.locator('text=Notas').count() > 0 ||
                           await page.locator('text=Calificaciones').count() > 0 ||
                           await page.locator('text=Grades').count() > 0 ||
                           await page.url().includes('Notas') ||
                           await page.url().includes('Grades');

        if (!notasLoaded) {
            throw new Error('No se pudo verificar el acceso a la sección de notas');
        }

        console.log('Sección de notas accedida exitosamente.');
        return { success: true, message: 'Navegación a notas completada' };

    } catch (error) {
        // Manejo de errores para navegación fallida o secciones no encontradas
        console.error('Error durante la navegación:', error.message);

        if (error.name === 'TimeoutError') {
            throw new Error('Timeout durante la navegación: ' + error.message);
        } else if (error.message.includes('net::ERR')) {
            throw new Error('Error de red durante la navegación: ' + error.message);
        } else {
            throw new Error('Error de navegación: ' + error.message);
        }
    }
}

// Función asíncrona para extraer notas desde la página de notas
// Utiliza selectores CSS para localizar tablas de calificaciones
// Retorna un objeto con asignaturas como claves y notas como valores
async function extractGrades(page) {
    try {
        // Esperar a que la tabla de notas esté presente en el DOM
        // Para ExtJS, usar selectores específicos de componentes ExtJS como grids
        await page.waitForSelector('.x-grid-row, .x-panel-body table, table', { timeout: 60000 });

        // Extraer datos de la tabla usando page.$$eval
        // Intentar primero selectores ExtJS específicos, luego fallback a genérico
        let gradesData = {};

        // Intentar con selectores ExtJS (grids)
        try {
            gradesData = await page.$$eval('.x-grid-row', rows => {
                const grades = {};
                rows.forEach(row => {
                    const cells = row.querySelectorAll('.x-grid-cell, td');
                    if (cells.length >= 2) {
                        const subject = cells[0].textContent.trim();
                        const grade = cells[1].textContent.trim();
                        if (subject && grade) {
                            grades[subject] = grade;
                        }
                    }
                });
                return grades;
            });
        } catch (extjsError) {
            // Fallback a selectores genéricos si ExtJS falla
            gradesData = await page.$$eval('table tr', rows => {
                const grades = {};
                // Iterar sobre las filas, saltando la primera si es encabezado
                for (let i = 1; i < rows.length; i++) {
                    const cells = rows[i].querySelectorAll('td');
                    if (cells.length >= 2) {
                        const subject = cells[0].textContent.trim();
                        const grade = cells[1].textContent.trim();
                        if (subject && grade) {
                            grades[subject] = grade;
                        }
                    }
                }
                return grades;
            });
        }

        // Validar los datos extraídos
        // Verificar que al menos se extrajeron algunas notas
        if (Object.keys(gradesData).length === 0) {
            throw new Error('No se encontraron notas en la tabla');
        }

        // Validar formato de notas (deben ser números o strings numéricos)
        for (const [subject, grade] of Object.entries(gradesData)) {
            const gradeNum = parseFloat(grade);
            if (isNaN(gradeNum) || gradeNum < 0 || gradeNum > 5) {
                throw new Error(`Nota inválida para ${subject}: ${grade}`);
            }
        }

        return gradesData;

    } catch (error) {
        // Manejo de errores específicos
        if (error.name === 'TimeoutError') {
            throw new Error('Timeout esperando tabla de notas: ' + error.message);
        } else if (error.message.includes('No se encontraron notas')) {
            throw new Error('Tabla de notas encontrada pero sin datos válidos: ' + error.message);
        } else {
            throw new Error('Error extrayendo notas: ' + error.message);
        }
    }
}

// Función asíncrona para extraer horarios desde la página de horarios
// Utiliza selectores CSS para localizar tablas de horarios
// Retorna un objeto con días como claves y objetos de asignaturas con horarios como valores
async function extractSchedule(page) {
    try {
        // Esperar a que la tabla de horarios esté presente en el DOM
        // Para ExtJS, usar selectores específicos de componentes ExtJS
        await page.waitForSelector('.x-grid-row, .x-panel-body table, table', { timeout: 60000 });

        // Extraer datos de la tabla usando page.$$eval
        // Intentar primero selectores ExtJS específicos, luego fallback a genérico
        let scheduleData = {};

        // Intentar con selectores ExtJS (grids)
        try {
            scheduleData = await page.$$eval('.x-grid-row', rows => {
                const schedule = {};
                rows.forEach(row => {
                    const cells = row.querySelectorAll('.x-grid-cell, td');
                    if (cells.length >= 3) {
                        const day = cells[0].textContent.trim().toLowerCase();
                        const subject = cells[1].textContent.trim();
                        const time = cells[2].textContent.trim();
                        if (day && subject && time) {
                            if (!schedule[day]) {
                                schedule[day] = {};
                            }
                            schedule[day][subject] = time;
                        }
                    }
                });
                return schedule;
            });
        } catch (extjsError) {
            // Fallback a selectores genéricos si ExtJS falla
            scheduleData = await page.$$eval('table tr', rows => {
                const schedule = {};
                // Iterar sobre las filas, saltando la primera si es encabezado
                for (let i = 1; i < rows.length; i++) {
                    const cells = rows[i].querySelectorAll('td');
                    if (cells.length >= 3) {
                        const day = cells[0].textContent.trim().toLowerCase();
                        const subject = cells[1].textContent.trim();
                        const time = cells[2].textContent.trim();
                        if (day && subject && time) {
                            if (!schedule[day]) {
                                schedule[day] = {};
                            }
                            schedule[day][subject] = time;
                        }
                    }
                }
                return schedule;
            });
        }

        // Validar los datos extraídos
        // Verificar que al menos se extrajeron algunos horarios
        if (Object.keys(scheduleData).length === 0) {
            throw new Error('No se encontraron horarios en la tabla');
        }

        // Validar formato de horarios (deben ser strings no vacíos)
        for (const [day, subjects] of Object.entries(scheduleData)) {
            if (typeof subjects !== 'object' || Object.keys(subjects).length === 0) {
                throw new Error(`Horarios inválidos para ${day}`);
            }
            for (const [subject, time] of Object.entries(subjects)) {
                if (!time || typeof time !== 'string') {
                    throw new Error(`Horario inválido para ${subject} en ${day}: ${time}`);
                }
            }
        }

        return scheduleData;

    } catch (error) {
        // Manejo de errores específicos
        if (error.name === 'TimeoutError') {
            throw new Error('Timeout esperando tabla de horarios: ' + error.message);
        } else if (error.message.includes('No se encontraron horarios')) {
            throw new Error('Tabla de horarios encontrada pero sin datos válidos: ' + error.message);
        } else {
            throw new Error('Error extrayendo horarios: ' + error.message);
        }
    }
}

// Exportar las funciones para uso en otros módulos
module.exports = {
    scrapeUniversityData,
    scrapeMultiplePages,
    loginToPortal,
    navigateToGrades,
    extractGrades,
    extractSchedule
};