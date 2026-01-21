import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // Usar la variable de entorno de Render o una ruta por defecto
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // CRÍTICO: Para no agotar la RAM de Render
            '--disable-gpu'
        ],
    }
});

client.on('qr', (qr) => {
    // Verás este QR en la pestaña "Logs" de Render
    qrcode.generate(qr, { small: true });
    console.log('📱 ESCANEA EL QR EN LOS LOGS DE RENDER');
});

client.on('ready', () => {
    console.log('✅ Bot de WhatsApp listo y conectado');
});

client.initialize();

export default client;