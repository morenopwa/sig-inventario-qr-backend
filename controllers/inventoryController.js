import Item from '../models/Item.js';
import Movement from '../models/Movement.js'; // Asegúrate de tener este modelo

export const processTransactionFromChat = async (req, res) => {
    const { quantity, itemName, personName, type, category, autoCreate } = req.body;

    try {
        // 1. Buscar el Item (Case insensitive para que coincida con el chat)
        let item = await Item.findOne({ name: itemName.toUpperCase() });

        // 2. Si no existe y autoCreate es true, lo creamos
        if (!item && autoCreate) {
            item = new Item({
                name: itemName.toUpperCase(),
                stock: 0,
                category: category || 'General',
                qrCode: `AUTO-${Date.now()}`
            });
            await item.save();
        }

        if (!item) return res.status(404).json({ success: false, message: "Item no encontrado" });

        // 3. Validar stock en salidas
        if (type === 'OUT' && item.stock < quantity) {
            return res.status(400).json({ success: false, message: "Stock insuficiente" });
        }

        // 4. Actualizar Stock
        const stockChange = type === 'IN' ? quantity : -quantity;
        item.stock += stockChange;
        await item.save();

        // 5. REGISTRAR EN EL KARDEX (Movement)
        const movement = new Movement({
            itemId: item._id,
            materialName: item.name,
            // Agregamos estos campos para que el Kardex no salga vacío o con 'und'
            alias: item.alias || "", 
            unit: item.unit || "und", 
            type: type === 'IN' ? 'Compra' : 'Salida',
            quantity: quantity,
            workerName: personName.toUpperCase(),
            destination: req.body.destination || (type === 'IN' ? 'ALMACEN' : 'OBRA'), 
            date: new Date(),
            unitCost: item.lastCost || 0 
        });
        await movement.save();

        res.json({ success: true, item, movement });
    } catch (error) {
        console.error("Error en transacción:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
};