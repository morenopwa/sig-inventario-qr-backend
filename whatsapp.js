import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

let sock;
// CONFIGURACIÓN: Tu número de WhatsApp (con código de país, sin el + ni espacios)
const targetNumber = "51999888777"; 

export const connectToWhatsApp = async () => {
    // Guarda la sesión en la carpeta 'auth_info_baileys' para no pedir QR siempre
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
            console.log('--- NUEVO QR GENERADO. ESCANEA EN LOS LOGS DE RENDER ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp conectado exitosamente con Baileys');
        }
    });
};

// Función para enviar mensajes automáticos
export const sendWSMessage = async (text) => {
    if (!sock) {
        console.log("⚠️ WhatsApp no está listo todavía");
        return;
    }
    try {
        const id = `${targetNumber}@s.whatsapp.net`;
        await sock.sendMessage(id, { text });
        console.log("📤 Mensaje enviado correctamente");
    } catch (error) {
        console.error("❌ Error al enviar mensaje:", error);
    }
};

// Ejecutar la conexión al importar el archivo
connectToWhatsApp();