import Item from '../models/Item.js';
import Movement from '../models/Movement.js';

export const processTransactionFromChat = async (req, res) => {
    // Recibimos los datos ya limpios desde el ChatPage.jsx
    const { itemName, quantity, unit, personName, type, operationType, autoCreate, destination } = req.body;

    try {
        if (!itemName || isNaN(quantity)) {
            return res.status(400).json({ success: false, message: "Datos incompletos (nombre o cantidad)" });
        }

        const normalizedName = itemName.trim().toUpperCase();

        // 1. Buscar el Item por nombre exacto
        let item = await Item.findOne({ name: normalizedName });

        // 2. Si no existe, lo creamos con la categoría correcta
        if (!item && autoCreate) {
            // Lógica para asignar categoría según el nombre o el operationType
            let category = 'Consumibles'; // Por defecto para el chat
            if (operationType === 'RECAMBIO') category = 'Herramientas';
            
            item = new Item({
                name: normalizedName,
                stock: 0,
                category: category,
                unit: unit || 'UND',
                qrCode: `AUTO-${Date.now()}`
            });
            await item.save();
        }

        if (!item) return res.status(404).json({ success: false, message: "Material no encontrado" });

        // 3. Validar stock en salidas (OUT)
        if (type === 'OUT' && item.stock < quantity) {
            return res.status(400).json({ success: false, message: `Stock insuficiente. Disponible: ${item.stock}` });
        }

        // 4. ACTUALIZACIÓN CRÍTICA DEL STOCK
        const stockChange = type === 'IN' ? quantity : -quantity;
        item.stock += stockChange;
        
        // Guardamos también la última unidad y costo si vienen en el request
        if (unit) item.unit = unit; 
        await item.save();

        // 5. REGISTRAR EN EL KARDEX (Movement)
        const movement = new Movement({
            itemId: item._id,
            materialName: item.name,
            alias: item.alias || "",
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
            message: `Stock actualizado: ${item.name} ahora tiene ${item.stock}`,
            item
        });

    } catch (error) {
        console.error("Error en transacción:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
};