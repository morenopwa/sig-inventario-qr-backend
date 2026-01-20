import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

export const processTransactionFromChat = async (req, res) => {
    // Recibimos los datos ya procesados por el ChatPage.jsx
    const { itemName, quantity, unit, personName, type, operationType, autoCreate, destination } = req.body;

    try {
        if (!itemName || isNaN(quantity)) {
            return res.status(400).json({ success: false, message: "Datos incompletos." });
        }

        const normalizedName = itemName.toUpperCase().trim();

        // 1. Buscar el Item
        let item = await Item.findOne({ name: normalizedName });

        // 2. Si no existe y autoCreate es true, crearlo
        if (!item && autoCreate) {
            item = new Item({
                name: normalizedName,
                stock: 0,
                category: 'Consumibles', // IMPORTANTE: Para que salga en la pestaña Consumibles
                unit: unit || 'UND',
                qrCode: `AUTO-${Date.now()}`
            });
            await item.save();
        }

        if (!item) return res.status(404).json({ success: false, message: "Material no encontrado." });

        // 3. Validar Stock
        if (type === 'OUT' && item.stock < quantity) {
            return res.status(400).json({ success: false, message: "Stock insuficiente." });
        }

        // 4. ACTUALIZAR STOCK (Esto es lo que hace que cambie en la pestaña Consumibles)
        const stockChange = type === 'IN' ? quantity : -quantity;
        item.stock += stockChange;
        await item.save();

        // 5. Registrar Movimiento
        const movement = new Movement({
            itemId: item._id,
            materialName: item.name,
            unit: unit || item.unit,
            type: operationType || (type === 'IN' ? 'ENTRADA' : 'SALIDA'),
            quantity: quantity,
            workerName: personName || "GENERAL",
            destination: destination || (type === 'IN' ? 'ALMACEN' : 'OBRA'),
            date: new Date()
        });
        await movement.save();

        res.json({ success: true, item, movement });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, message: "Error en el servidor." });
    }
};