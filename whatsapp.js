// backend/whatsapp.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

let sock;

// CONFIGURACIÓN: Aquí pegarás el ID del grupo cuando lo obtengas
const WHATSAPP_GROUP_ID = "120363XXXXXXXXXX@g.us"; 

export const connectToWhatsApp = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        browser: ["Sistema Asistencia", "Chrome", "1.0.0"],
        printQRInTerminal: false,
        // Esto ayuda a que no ignore mensajes durante la sincronización
        shouldSyncHistoryMessage: () => true 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('--- NUEVO QR GENERADO ---');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') console.log('✅ WhatsApp conectado y escuchando...');
    });

    // --- LOG DE DEPURACIÓN TOTAL ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        // Capturamos cualquier tipo de texto
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     "Mensaje no es texto (puede ser imagen o sticker)";

        const sender = msg.key.remoteJid;

        // ESTO APARECERÁ EN LOS LOGS DE RENDER
        console.log(`📢 EVENTO DETECTADO: [De: ${sender}] - [Texto: ${text}]`);

        if (text.toLowerCase().includes('!id')) {
            console.log("🎯 COMANDO !id DETECTADO CORRECTAMENTE");
            await sock.sendMessage(sender, { 
                text: `📍 ID de este chat:\n${sender}` 
            });
        }
    });
};

// ASEGÚRATE DE QUE ESTA FUNCIÓN TENGA EL 'export'
export const sendWSMessage = async (text) => {
    if (!sock) {
        console.log("⚠️ WhatsApp no inicializado");
        return;
    }
    try {
        await sock.sendMessage(WHATSAPP_GROUP_ID, { text });
        console.log("📤 Mensaje enviado correctamente");
    } catch (error) {
        console.error("❌ Error enviando mensaje:", error);
    }
};

connectToWhatsApp();