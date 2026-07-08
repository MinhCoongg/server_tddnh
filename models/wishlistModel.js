import { BASE_URL } from '../config/constants.js';
import { execute } from '../config/db.js';

export default class WishListModel{
    static async addToWishlist(userId, productId) {
        const [result] = await execute(
            'INSERT INTO wishlist (userId, productId) VALUES (?, ?)',
            [userId, productId]
        );
        return result.insertId;
    }

    static async checkExists(userId, productId) {
        const [rows] = await execute(
            'SELECT id FROM wishlist WHERE userId = ? AND productId = ?',
            [userId, productId]
        );
        return rows.length > 0;
    }

    static async removeFromWishlist(userId, productId) {
        await execute(
            'DELETE FROM wishlist WHERE userId = ? AND productId = ?',
            [userId, productId]
        );
    }

    static async getWishlistByUserId(userId) {
        const [rows] = await execute(`
           SELECT 
            p.id, p.title, 
            (SELECT MIN(pricePerDay) FROM producttierpricing ptp WHERE ptp.productId = p.id) AS minPrice,
            (SELECT imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as thumbnail,
            sa.fullAddress as location,
            COALESCE(ROUND(AVG(r.rating), 1), 5.0) as rating,
            COUNT(r.id) as reviewCount
        FROM wishlist w
        JOIN product p ON w.productId = p.id
        LEFT JOIN shippingaddress sa ON p.addressId = sa.id
        LEFT JOIN review r ON p.id = r.productId
        WHERE w.userId = ?
        GROUP BY p.id
        ORDER BY w.id DESC
        `, [userId]);
        return rows.map(row => ({
            ...row,
            thumbnail: row.thumbnail 
        }));
    }
}