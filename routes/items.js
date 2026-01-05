// routes/items.js
router.put('/devolver/:historyId', async (req, res) => {
    try {
        const { historyId } = req.params;
        const { itemId, quantity } = req.body;

        // 1. Actualizamos el stock del producto
        await Item.findByIdAndUpdate(itemId, { $inc: { stock: quantity } });

        // 2. Buscamos el ítem y actualizamos el estado dentro de su array de historial
        await Item.updateOne(
            { "history._id": historyId },
            { $set: { "history.$.status": "COMPLETADO" } }
        );

        res.json({ message: "Devolución registrada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al procesar devolución" });
    }
});