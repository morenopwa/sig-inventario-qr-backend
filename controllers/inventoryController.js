import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

export const processTransactionFromChat = async (req, res) => {
    // rawInput es el texto del chat, ej: "2.5 kg soldadura 7018"
    const { rawInput, personName, type, category, autoCreate, destination } = req.body;

    try {
        // Expresión regular: busca un número (entero o decimal) + una unidad opcional (kg/kilos) + nombre
        const regex = /^(\d+(?:\.\d+)?)\s*(kg|kilos)?\s*(.*)$/i;
        const match = rawInput.match(regex);

        if (!match) {
            return res.status(400).json({ 
                success: false, 
                message: "Formato incorrecto. Empieza con la cantidad (ej: 2 kg soldadura)" 
            });
        }

        const quantity = parseFloat(match[1]);
        const unitFromChat = match[2] ? 'kg' : null; // Si escribió kg o kilos, guardamos 'kg'
        const itemName = match[3].trim().toUpperCase();

        // 1. Buscar el Item en la base de datos
        let item = await Item.findOne({ name: itemName });

        // 2. Si no existe y autoCreate es true, lo creamos
        if (!item && autoCreate) {
            item = new Item({
                name: itemName,
                stock: 0,
                category: category || 'General',
                unit: unitFromChat || 'und', // Si el chat detectó kg, lo guarda así
                qrCode: `AUTO-${Date.now()}`
            });
            await item.save();
        }

        if (!item) return res.status(404).json({ success: false, message: "Material no encontrado" });

        // 3. Validar stock en salidas
        if (type === 'OUT' && item.stock < quantity) {
            return res.status(400).json({ success: false, message: "Stock insuficiente" });
        }

        // 4. Actualizar Stock del Item
        const stockChange = type === 'IN' ? quantity : -quantity;
        item.stock += stockChange;
        await item.save();

        // 5. REGISTRAR EN EL KARDEX (Movement)
        const movement = new Movement({
            itemId: item._id,
            materialName: item.name,
            alias: item.alias || "", // Trae el alias si ya existe
            unit: unitFromChat || item.unit || 'und', // Prioridad al chat, luego al item
            type: type === 'IN' ? 'Compra' : 'Salida',
            quantity: quantity,
            workerName: personName ? personName.toUpperCase() : "SIN NOMBRE",
            destination: destination || (type === 'IN' ? 'ALMACEN' : 'OBRA'),
            date: new Date(),
            unitCost: item.lastCost || 0 // Mantenemos el costo guardado en el item
        });
        await movement.save();

        res.json({ 
            success: true, 
            message: `Registrado: ${quantity} ${movement.unit} de ${item.name}`,
            item, 
            movement 
        });

    } catch (error) {
        console.error("Error en transacción:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
};