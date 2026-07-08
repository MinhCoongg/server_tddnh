import { BASE_URL } from '../config/constants.js';
import { execute } from '../config/db.js';
export default class AdminModel{
    static async getDashboardStats() {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM user) as totalUsers,
                (SELECT COUNT(*) FROM product) as totalProducts,
                (SELECT COUNT(*) FROM product WHERE status = 'Pending') as pendingProducts,
                (SELECT COUNT(*) FROM invoice WHERE status IN ('Paid', 'Completed')) as totalRentals,
                (SELECT COUNT(*) FROM complain) as totalComplains,
               (SELECT SUM(rentalFee + shippingFee + penaltyFee) 
                    FROM invoice 
                    WHERE status IN ('Paid', 'Completed')) as totalRevenue,
                (SELECT COUNT(*) FROM invoice WHERE status = 'Paid' OR status = 'Completed') as totalTransactions,
                (SELECT AVG(rating) FROM review) as averageRating
        `;
        const [rows] = await execute(query);
        return rows[0];
    }

    static async getMonthlyStats() {
        const query = `
            SELECT 
                DATE_FORMAT(createdAt, '%m/%Y') as month,
                COUNT(id) as totalRentals,
                SUM(rentalFee + shippingFee + penaltyFee) as totalRevenue
            FROM invoice
            WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            AND status IN ('Paid', 'Completed')
            GROUP BY DATE_FORMAT(createdAt, '%m/%Y')
            ORDER BY MIN(createdAt) ASC 
        `;
        const [rows] = await execute(query);
        return rows;
    }

    static async getTopRentedCategories() {
        const query = `
            SELECT 
                c.categoryName,
                COUNT(id.productId) as rentalCount
            FROM invoice i
            JOIN invoicedetail id ON i.id = id.invoiceId
            JOIN product p ON id.productId = p.id
            JOIN category c ON p.categoryId = c.id
            WHERE i.status IN ('Paid', 'Completed') 
            GROUP BY c.id, c.categoryName
            ORDER BY rentalCount DESC
            LIMIT 5;
        `;
        const [rows] = await execute(query);
        return rows;
    }


    static async getAllSystemOrders(status, search, page = 1, limit = 5) {
        const l = parseInt(limit, 10);
        const o = (parseInt(page, 10) - 1) * l;
        let query = `
            SELECT DISTINCT
                r.id, 
                CONCAT('#RS', r.id) as orderCode,
                r.startDate, r.endDate, 
                r.status,
                u_renter.name as renterName, u_renter.phoneNumber as renterPhone,
                u_owner.name as ownerName, u_owner.phoneNumber as ownerPhone,
                (IFNULL(r.rentalFee, 0) + IFNULL(r.shippingFee, 0) + IFNULL(i.penaltyFee, 0)) as netIncome,
                r.depositFee,
                p.title as productName,
                pi.imageUrl as productImage
            FROM rentalrequest r
            JOIN user u_renter ON r.renterId = u_renter.id
            LEFT JOIN invoice i ON r.id = i.rentalId
            JOIN rentalrequestdetail rd ON r.id = rd.rentalRequestId
            JOIN product p ON rd.productId = p.id
            LEFT JOIN productimage pi ON pi.productId = p.id
            JOIN user u_owner ON p.ownerId = u_owner.id
            WHERE 1=1
        `;
        
        const params = [];
        if (status && status !== 'All') {
            query += ` AND r.status = ?`; 
            params.push(status);
        }

        if (search && search.trim() !== '') {
            query += ` AND (r.id LIKE ? OR u_renter.name LIKE ? OR p.title LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        query += ` ORDER BY r.createdAt DESC LIMIT ? OFFSET ? `;
        params.push(l, o);
        
        const [rows] = await execute(query, params);
        return rows;
    }

    static async getRentalStats() {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM rentalrequest) as totalOrders,
                (SELECT COUNT(*) FROM rentalrequest WHERE status = 'Pending') as pendingOrders,
                (SELECT COUNT(*) FROM rentalrequest WHERE status = 'Delivered') as rentingOrders,
                (SELECT COUNT(*) FROM rentalrequest WHERE status = 'Completed') as completedOrders,
                (SELECT COUNT(*) FROM rentalrequest WHERE status = 'Cancelled') as cancelledOrders
        `;
        const [rows] = await execute(query);
        return rows[0];
    }
}