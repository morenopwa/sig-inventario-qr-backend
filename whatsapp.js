import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

let sock;
// REEMPLAZA ESTO con el ID que obtengas con el comando !id
const WHATSAPP_GROUP_ID = "12036302XXXXXXXXX@g.us"; 

export const connectToWhatsApp = async () => {
    // La sesión se guarda en esta carpeta (temporal en Render gratis)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ["Sistema Asistencia", "Chrome", "1.0.0"],
        // OPTIMIZACIÓN PARA RENDER (MEMORIA BAJA)
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        linkPreviewHighQuality: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--- NUEVO QR GENERADO: ESCANEA RÁPIDO ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp conectado exitosamente en Render');
        }
    });

    // Escuchar mensajes para obtener el ID del grupo
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const sender = msg.key.remoteJid;

        if (text.toLowerCase().trim() === '!id') {
            console.log("📍 ID Capturado:", sender);
            await sock.sendMessage(sender, { 
                text: `✅ *CONEXIÓN ACTIVA*\n\nEl ID de este chat es:\n\`${sender}\`\n\nCópialo en tu archivo whatsapp.js` 
            });
        }
    });
};

// Función para enviar mensajes desde otros archivos
export const sendWSMessage = async (text) => {
    if (!sock) {
        console.log("⚠️ No se pudo enviar: WhatsApp no está conectado");
        return;
    }
    try {
        await sock.sendMessage(WHATSAPP_GROUP_ID, { text });
        console.log("📤 Mensaje de asistencia enviado al grupo");
    } catch (error) {
        console.error("❌ Error al enviar mensaje:", error);
    }
};

// Iniciar automáticamente
connectToWhatsApp();