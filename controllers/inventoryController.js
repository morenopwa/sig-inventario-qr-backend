import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

// Esta es la función que llama tu ChatPage
export const processTransactionFromChat = async (req, res) => {
    const { itemName, quantity, unit, personName, type, operationType, autoCreate, destination } = req.body;

    try {
        if (!itemName || isNaN(quantity)) {
            return res.status(400).json({ success: false, message: "Datos incompletos (nombre o cantidad)." });
        }

        const normalizedName = itemName.toUpperCase().trim();

        // 1. Buscar el Item (o crearlo si no existe)
        let item = await Item.findOne({ name: normalizedName });

        if (!item && autoCreate) {
            item = new Item({
                name: normalizedName,
                stock: 0,
                category: 'Consumibles', // Categoría por defecto para que aparezca en la pestaña
                unit: unit || 'UND',
                qrCode: `AUTO-${Date.now()}`
            });
            await item.save();
        }

        if (!item) return res.status(404).json({ success: false, message: "Material no encontrado." });

        // 2. Validar stock disponible para salidas
        if (type === 'OUT' && item.stock < quantity) {
            return res.status(400).json({ success: false, message: `Stock insuficiente. Disponible: ${item.stock}` });
        }

        // 3. ACTUALIZACIÓN DEL STOCK
        const stockChange = type === 'IN' ? quantity : -quantity;
        item.stock += stockChange;
        await item.save();

        // 4. REGISTRAR EN EL KARDEX (Movement)
        const movement = new Movement({
            itemId: item._id,
            materialName: item.name,
            unit: unit || item.unit || 'UND',
            type: operationType || (type === 'IN' ? 'ENTRADA' : 'SALIDA'),
            quantity: quantity,
            workerName: personName ? personName.toUpperCase() : "GENERAL",
            destination: destination || (type === 'IN' ? 'ALMACEN' : 'OBRA'),
            date: new Date()
        });
        await movement.save();

        res.json({ 
            success: true, 
            message: `Registro exitoso. Nuevo stock de ${item.name}: ${item.stock}`,
            item, 
            movement 
        });

    } catch (error) {
        console.error("Error en transacción:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
};

// Obtener items para la tabla de inventario
export const getItems = async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener items" });
    }
};