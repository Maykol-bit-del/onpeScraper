import puppeteer from 'puppeteer-core';
import fs from 'fs';

const cache = new Map();
const activeQueries = new Map();
let sharedBrowser = null;
let browserUseCount = 0;

// Rutas comunes en Windows y Linux (Docker / Render / Cloud)
const CHROME_PATHS = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

function getChromeExecutablePath() {
    for (const p of CHROME_PATHS) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }
    // Si no encuentra ruta fija, deja que puppeteer use su propio binario empaquetado
    return undefined;
}

async function getBrowserInstance() {
    if (sharedBrowser) {
        try {
            if (sharedBrowser.connected) {
                const version = await sharedBrowser.version();
                if (version) {
                    browserUseCount++;
                    if (browserUseCount < 80) {
                        return sharedBrowser;
                    }
                }
            }
        } catch (e) {
            // Error en browser previo, reconectando
        }

        try {
            await sharedBrowser.close().catch(() => {});
        } catch (e) {}
        sharedBrowser = null;
        browserUseCount = 0;
    }

    const chromePath = getChromeExecutablePath();
    const launchOptions = {
        headless: 'new',
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1280,800',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
        ]
    };

    if (chromePath) {
        launchOptions.executablePath = chromePath;
    }

    console.log('[ONPE-SCRAPER] Iniciando instancia de navegador...', chromePath ? `(Ruta: ${chromePath})` : '(Puppeteer Bundle)');
    sharedBrowser = await puppeteer.launch(launchOptions);
    browserUseCount = 1;
    return sharedBrowser;
}

// Pre-calentar el navegador en segundo plano
setTimeout(() => {
    getBrowserInstance().catch(err => {
        console.warn('[ONPE-SCRAPER] Pre-calentamiento de navegador en segundo plano:', err.message);
    });
}, 1000);

/**
 * Consulta automatizada a la ONPE mediante Chrome Headless
 * Supera automáticamente la protección AWS WAF / CloudFront y extrae los datos oficiales de votación.
 * @param {string} dni Número de DNI de 8 dígitos
 */
export async function scrapeOnpe(dni) {
    if (!dni || String(dni).length !== 8) {
        return { success: false, message: 'DNI inválido (debe tener 8 dígitos)' };
    }

    const dniStr = String(dni).trim();

    // 1. Verificación en caché de memoria (instantáneo)
    if (cache.has(dniStr)) {
        console.log(`[ONPE-SCRAPER] Retornando desde caché en memoria para DNI: ${dniStr}`);
        return cache.get(dniStr);
    }

    // 2. Si ya hay una consulta en curso para el mismo DNI, esperar la misma promesa
    if (activeQueries.has(dniStr)) {
        return activeQueries.get(dniStr);
    }

    const queryPromise = (async () => {
        let page = null;

        try {
            console.log(`[ONPE-SCRAPER] Consultando ONPE en tiempo real para DNI: ${dniStr}...`);
            const browser = await getBrowserInstance();
            page = await browser.newPage();
            
            // Ocultar bandera de webdriver
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            let capturedData = null;
            let capturedToken = null;

            // Interceptar respuesta de red de la API de ONPE
            page.on('response', async (res) => {
                const url = res.url();
                if (url.includes('/busqueda/dni')) {
                    try {
                        const json = await res.json();
                        if (json && json.data && json.data.token) {
                            capturedToken = json.data.token;
                        }
                    } catch (e) {}
                }

                if (url.includes('/consulta/definitiva') || url.includes('/consulta/provisional')) {
                    try {
                        const json = await res.json();
                        if (json && (json.success || json.data)) {
                            capturedData = json;
                        }
                    } catch (e) {}
                }
            });

            await page.goto('https://consultaelectoral.onpe.gob.pe/inicio', {
                waitUntil: 'networkidle2',
                timeout: 25000
            });

            const inputSelector = 'input[placeholder*="DNI"], input[type="tel"], #mat-input-0, input';
            await page.waitForSelector(inputSelector, { timeout: 10000 });

            // Enfocar, limpiar y escribir con retardo para asegurar reactividad en Angular
            await page.click(inputSelector, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type(inputSelector, dniStr, { delay: 25 });

            // Pausa breve para validación de Angular
            await new Promise(r => setTimeout(r, 200));

            const btnSelector = 'button.button_consulta, button.button_estilo4, button[type="submit"], button';
            await page.waitForSelector(btnSelector, { timeout: 5000 });

            let clicked = false;
            const buttons = await page.$$(btnSelector);
            for (const btn of buttons) {
                const text = await page.evaluate(el => el.innerText || el.textContent, btn);
                if (/CONSULTAR/i.test(text)) {
                    await btn.click();
                    clicked = true;
                    break;
                }
            }

            if (!clicked) {
                await page.keyboard.press('Enter');
            }

            // Esperar captura de respuesta API o navegación (hasta 12 segundos)
            for (let i = 0; i < 60; i++) {
                if (capturedData) break;
                await new Promise(r => setTimeout(r, 200));
            }

            // Fallback 1: Si se capturó el token de sesión pero no la consulta definitiva, invocarla directamente en contexto
            if (!capturedData && capturedToken) {
                try {
                    const fallbackData = await page.evaluate(async (token) => {
                        const res = await fetch('https://consultaelectoral.onpe.gob.pe/v1/api/consulta/definitiva', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({})
                        });
                        return await res.json();
                    }, capturedToken);

                    if (fallbackData && (fallbackData.success || fallbackData.data)) {
                        capturedData = fallbackData;
                    }
                } catch (e) {
                    console.warn('[ONPE-SCRAPER] Error en fallback de token:', e);
                }
            }

            // Si se capturaron los datos de la API
            if (capturedData && (capturedData.success || capturedData.data)) {
                const raw = capturedData.data || capturedData;
                const dep = (raw.departamento || '').toUpperCase().trim();
                const prov = (raw.provincia || '').toUpperCase().trim();
                const dist = (raw.distrito || '').toUpperCase().trim();
                const cp = (raw.centroPoblado || '').toUpperCase().trim();
                const baseUbigeo = [dep, prov, dist].filter(Boolean).join(' / ') || raw.ubigeo || '';
                const centroPobladoUnido = cp ? (baseUbigeo ? `${baseUbigeo} / ${cp}` : cp) : baseUbigeo;

                const formatted = {
                    success: true,
                    data: {
                        dni: raw.dni || dniStr,
                        nombres: raw.nombres || '',
                        apellidos: raw.apellidos || '',
                        nombreCompleto: raw.nombreCompleto || `${raw.nombres || ''} ${raw.apellidos || ''}`.trim().toUpperCase(),
                        localVotacion: raw.localVotacion || raw.local || raw.nombreLocal || '',
                        mesaSufragio: raw.mesaSufragio || raw.mesa || raw.numeroMesa || '',
                        orden: raw.orden ? String(raw.orden) : (raw.numOrden ? String(raw.numOrden) : ''),
                        direccion: raw.direccion || raw.direccionLocal || '',
                        referencia: raw.referencia || raw.referenciaLocal || '',
                        cargo: raw.cargo || (raw.miembroMesa ? 'MIEMBRO DE MESA' : 'NO ERES MIEMBRO DE MESA'),
                        centroPoblado: centroPobladoUnido,
                        ubigeo: centroPobladoUnido,
                        miembroMesa: typeof raw.miembroMesa === 'boolean' ? raw.miembroMesa : (raw.cargo && !raw.cargo.toUpperCase().includes('NO')),
                        localLatitud: raw.localLatitud || raw.latitud || null,
                        localLongitud: raw.localLongitud || raw.longitud || null
                    }
                };

                cache.set(dniStr, formatted);
                console.log(`[ONPE-SCRAPER] ✅ Datos obtenidos para DNI ${dniStr}: Local = ${formatted.data.localVotacion}, Mesa = ${formatted.data.mesaSufragio}`);
                return formatted;
            }

            // Fallback 2: Extracción directa de la vista DOM de la página de resultados
            const domData = await page.evaluate(() => {
                const text = document.body.innerText || '';
                if (!text.includes('local de votación') && !text.includes('Mesa') && !text.includes('DNI')) {
                    return null;
                }

                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                let local = '';
                let direccion = '';
                let referencia = '';
                let mesa = '';
                let orden = '';
                let cargo = 'NO ERES MIEMBRO DE MESA';
                let ubigeo = '';
                let nombre = '';

                if (/NO ERES MIEMBRO/i.test(text)) cargo = 'NO ERES MIEMBRO DE MESA';
                else if (/PRESIDENTE/i.test(text)) cargo = 'PRESIDENTE DE MESA';
                else if (/SECRETARIO/i.test(text)) cargo = 'SECRETARIO DE MESA';
                else if (/TERCER MIEMBRO/i.test(text)) cargo = 'TERCER MIEMBRO';
                else if (/SUPLENTE/i.test(text)) cargo = 'SUPLENTE';
                else if (/MIEMBRO DE MESA/i.test(text)) cargo = 'MIEMBRO DE MESA';

                const mesaM = text.match(/N[°ºo\.]*\s*de\s*Mesa[:\s]*\n*([0-9]{5,8})/i);
                if (mesaM) mesa = mesaM[1];

                const ordenM = text.match(/N[°ºo\.]*\s*de\s*Orden[:\s]*\n*([0-9]+)/i);
                if (ordenM) orden = ordenM[1];

                const ubiM = text.match(/Regi[oó]n\s*\/\s*Provincia\s*\/\s*Distrito[:\s]*\n*([A-ZÁÉÍÓÚÑ\s\/]+)/i);
                if (ubiM) ubigeo = ubiM[1].split('\n')[0].trim();

                const nomM = text.match(/Nombres y Apellidos[:\s]*\n*([A-ZÁÉÍÓÚÑ\s]+)/i);
                if (nomM) nombre = nomM[1].split('\n')[0].trim();

                const refM = text.match(/Referencia[:\s]*([^\n]+)/i);
                if (refM) referencia = refM[1].trim();

                const locIdx = lines.findIndex(l => /Tu local de votaci[oó]n/i.test(l) || /local de votaci[oó]n/i.test(l));
                if (locIdx !== -1) {
                    const candidate = [];
                    for (let i = locIdx + 1; i < lines.length; i++) {
                        const l = lines[i];
                        if (/^(?:ver|mapa|capac[ií]tate|N[°ºo\.]*|IMPORTANTE)/i.test(l)) continue;
                        if (/^Referencia/i.test(l)) break;
                        candidate.push(l);
                    }
                    if (candidate.length > 0) local = candidate[0];
                    if (candidate.length > 1) direccion = candidate.slice(1).join(' ').trim();
                }

                return { local, direccion, referencia, mesa, orden, cargo, ubigeo, nombre };
            });

            if (domData && (domData.local || domData.mesa)) {
                const formatted = {
                    success: true,
                    data: {
                        dni: dniStr,
                        nombres: '',
                        apellidos: '',
                        nombreCompleto: domData.nombre || '',
                        localVotacion: domData.local || '',
                        mesaSufragio: domData.mesa || '',
                        orden: domData.orden || '',
                        direccion: domData.direccion || '',
                        referencia: domData.referencia || '',
                        cargo: domData.cargo || 'NO ERES MIEMBRO DE MESA',
                        centroPoblado: domData.ubigeo || '',
                        ubigeo: domData.ubigeo || '',
                        miembroMesa: !domData.cargo.toUpperCase().includes('NO')
                    }
                };

                cache.set(dniStr, formatted);
                console.log(`[ONPE-SCRAPER] ✅ Datos obtenidos via DOM para DNI ${dniStr}: Local = ${formatted.data.localVotacion}`);
                return formatted;
            }

            return {
                success: false,
                message: 'No se encontraron datos de votación en ONPE para este DNI.'
            };

        } catch (err) {
            console.error(`[ONPE-SCRAPER] ❌ Error consultando DNI ${dniStr}:`, err.message);
            return {
                success: false,
                message: `Error al conectar con ONPE: ${err.message}`
            };
        } finally {
            if (page) {
                await page.close().catch(() => {});
            }
            activeQueries.delete(dniStr);
        }
    })();

    activeQueries.set(dniStr, queryPromise);
    return queryPromise;
}
