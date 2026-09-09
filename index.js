import express from 'express';
import cors from 'cors';
import { scrapeOnpe } from './onpeScraper.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de CORS amplia para permitir llamadas desde Netlify y Localhost
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());

// Endpoint de verificación de estado / Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'ONPE Scraper API - Geo-Padrón Electoral',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Endpoint principal: GET /api/consultar-onpe/:dni
app.get('/api/consultar-onpe/:dni', async (req, res) => {
    const { dni } = req.params;
    if (!dni || dni.length !== 8) {
        return res.status(400).json({ success: false, message: 'DNI inválido. Debe tener 8 dígitos.' });
    }

    try {
        console.log(`[API-SERVER] Recibida petición para DNI: ${dni}`);
        const result = await scrapeOnpe(dni);
        res.json(result);
    } catch (err) {
        console.error(`[API-SERVER] Error procesando DNI ${dni}:`, err);
        res.status(500).json({ success: false, message: err.message || 'Error interno del servidor scraper.' });
    }
});

// Endpoint alternativo: POST /api/consultar-onpe
app.post('/api/consultar-onpe', async (req, res) => {
    const dni = req.body.dni || req.body.numeroDocumento;
    if (!dni || String(dni).length !== 8) {
        return res.status(400).json({ success: false, message: 'DNI inválido. Debe tener 8 dígitos.' });
    }

    try {
        console.log(`[API-SERVER] Recibida petición POST para DNI: ${dni}`);
        const result = await scrapeOnpe(String(dni));
        res.json(result);
    } catch (err) {
        console.error(`[API-SERVER] Error procesando DNI ${dni}:`, err);
        res.status(500).json({ success: false, message: err.message || 'Error interno del servidor scraper.' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 SERVIDOR ONPE SCRAPER LISTO EN EL PUERTO ${PORT}`);
    console.log(`📡 URL Local: http://localhost:${PORT}/api/consultar-onpe/42773638`);
    console.log(`====================================================`);
});
