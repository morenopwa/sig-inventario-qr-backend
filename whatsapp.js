import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

const client = new Client({
    authStrategy: new LocalAuth(), // Guarda la sesión para no escanear siempre
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

// Generar el QR en la consola
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('--- ESCANEA EL QR PARA CONECTAR WHATSAPP ---');
});

client.on('ready', () => {
    console.log('✅ WhatsApp conectado exitosamente');
});

// Opcional: Escribe !id en cualquier chat para saber su ID exacto
client.on('message', async (msg) => {
    if (msg.body === '!id') {
        const chat = await msg.getChat();
        console.log("ID del chat:", chat.id._serialized);
        msg.reply("El ID de este chat es: " + chat.id._serialized);
    }
});

client.initialize();

export default client;