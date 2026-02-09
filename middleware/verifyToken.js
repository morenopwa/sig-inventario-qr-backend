import jwt from 'jsonwebtoken';

const verifyToken = (req, res, next) => {
    // El token suele venir en el header 'Authorization' como 'Bearer TOKEN'
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Acceso denegado. No hay token." });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Aquí se guardan los datos del usuario (id, name, role)
        next();
    } catch (err) {
        res.status(403).json({ message: "Token inválido o expirado" });
    }
};

export default verifyToken;