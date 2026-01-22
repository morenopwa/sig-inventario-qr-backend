import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

let sock;
// Pega aquí el ID del grupo cuando lo tengas
const WHATSAPP_GROUP_ID = "XXXXXXXXXXXXX@g.us"; 

export const connectToWhatsApp = async () => {
    // Esto crea la carpeta en el almacenamiento temporal de Render
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ["Sistema Asistencia", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('--- NUEVO QR GENERADO (ESCANEALO RÁPIDO) ---');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') console.log('✅ WhatsApp conectado');
    });

    // Escucha para el comando !id
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        
        if (text.toLowerCase().includes('!id')) {
            await sock.sendMessage(msg.key.remoteJid, { text: `📍 ID: ${msg.key.remoteJid}` });
        }
    });
};

export const sendWSMessage = async (text) => {
    if (!sock) return;
    try {
        await sock.sendMessage(WHATSAPP_GROUP_ID, { text });
    } catch (e) { console.log("Error envío:", e); }
};

connectToWhatsApp();