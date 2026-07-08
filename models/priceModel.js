import { execute } from '../config/db.js';

export default class TierModel {
    static async getTiersByProductId(productId) {
        try {
            const query = `
                SELECT id, productId, minDays, pricePerDay 
                FROM producttierpricing 
                WHERE productId = ? 
                ORDER BY minDays ASC
            `;
            
            const [rows] = await execute(query, [productId]);
            return rows; 
            
        } catch (error) {
            throw new Error('Lấy danh sách bảng bậc giá sản phẩm thất bại ' + error.message);
        }
    }
}