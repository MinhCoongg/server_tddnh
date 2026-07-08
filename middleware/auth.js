import jsonwebToken from 'jsonwebtoken';

const { verify } = jsonwebToken;
const JWT_SECRET = process.env.JWT_SECRET;


export default async function auth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                succeeded: false,
                message: "Yêu cầu quyền truy cập! (Token không tồn tại hoặc sai định dạng)"
            });
        }

        const token = authHeader.split(' ')[1];
        // Giải mã token
        const decoded = verify(token, JWT_SECRET);
        
        if (!decoded || !decoded.id) {
            return res.status(401).json({
                succeeded: false,
                message: "Xác thực thất bại! Token không hợp lệ."
            });
        }

        req.user = {
            id: decoded.id,         
            role: decoded.role 
        };
        
        req.token = token;
        next(); 

    } catch (error) {
        return res.status(401).json({ 
            succeeded: false, 
            message: "Xác thực thất bại hoặc Token đã hết hạn: " + error.message 
        });
    }
}

export const verifyAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ succeeded: false, message: "Chưa xác thực!" });
    }
    if (req.user.role === 'Admin') {
        next();
    } else {
        return res.status(403).json({ 
            succeeded: false,
            message: "Truy cập bị từ chối! Chỉ Admin mới được thực hiện thao tác này." 
        });
    }
};

