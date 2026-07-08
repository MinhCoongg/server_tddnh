import { execute, beginTransaction, commitTransaction, rollbackTransaction } from '../config/db.js';

export default class UserModel {

    static async findById(id) {
        try {
            const query = `SELECT id, name, password, email, phoneNumber, avatar, createdAt FROM user WHERE id = ?`;
            const [rows] = await execute(query, [id]);
            return rows[0] ?? null;
        } catch (error) {
            throw new Error('Lấy thông tin User thất bại: ' + error.message);
        }
    }

    static async findByEmail(email) {
        try {
            const query = `SELECT * FROM user WHERE email = ?`;
            const [rows] = await execute(query, [email]);
            return rows[0] ?? null;
        } catch (error) {
            throw new Error('Tìm User theo email thất bại: ' + error.message);
        }
    }

    static async findByPhoneNumber(phoneNumber) {
        try {
            const query = `SELECT * FROM user WHERE phoneNumber = ?`;
            const [rows] = await execute(query, [phoneNumber]);
            return rows[0] ?? null;
        } catch (error) {
            throw new Error('Tìm User theo phone thất bại: ' + error.message);
        }
    }
    
    static async create({ name, email, password, phoneNumber, avatar = '/uploads/rentshare.jpg', roleId = 2 }) {
        const existingUser = await this.findByEmail(email);
        if (existingUser) {
            throw new Error('Email này đã được sử dụng trong hệ thống!');
        }
        
        const existingPhone = await this.findByPhoneNumber(phoneNumber);
        if (existingPhone) {
            throw new Error('Số điện thoại đã được sử dụng!');
        }

        const connection = await beginTransaction();

        try {
            const userQuery = `
                INSERT INTO user (name, email, password, phoneNumber, avatar)
                VALUES (?, ?, ?, ?, ?)
            `;
            const [userResult] = await connection.execute(userQuery, [name, email, password, phoneNumber, avatar]);
            const userId = userResult.insertId;

            const roleQuery = `INSERT INTO userrole (user_id, role_id) VALUES (?, ?)`;
            await connection.execute(roleQuery, [userId, roleId]);

            const walletQuery = `INSERT INTO wallet (userId, balance, frozenAmount) VALUES (?, 0.00, 0.00)`;
            await connection.execute(walletQuery, [userId]);

            await commitTransaction(connection);
            return userId;

        } catch (error) {
            await rollbackTransaction(connection);
            throw new Error('Đăng ký tài khoản thất bại: ' + error.message);
        }
    }


    static async updateInfo(id, fields) {
        try {
            const keys = Object.keys(fields);
            if (keys.length === 0) return false;

            const setClause = keys.map(key => `${key} = ?`).join(', ');
            const values = Object.values(fields);
            values.push(id);

            const query = `UPDATE user SET ${setClause} WHERE id = ?`;
            const [result] = await execute(query, values);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error('Cập nhật thông tin thất bại: ' + error.message);
        }
    }

    static async delete(id) {
        try {
            const [result] = await execute(`DELETE FROM user WHERE id = ?`, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error('Xóa User thất bại: ' + error.message);
        }
    }

    // static async getUserSessionData(userId) {
    //     try {
    //         const query = `
    //             SELECT 
    //                 u.id, u.name, u.email, u.avatar,
    //                 r.roleName AS role,
    //                 w.balance, w.frozenAmount
    //             FROM user u
    //             LEFT JOIN userrole ur ON u.id = ur.user_id
    //             LEFT JOIN role r ON ur.role_id = r.id
    //             LEFT JOIN wallet w ON u.id = w.userId
    //             WHERE u.id = ?
    //         `;
    //         const [rows] = await execute(query, [userId]);
    //         return rows[0] ?? null;
    //     } catch (error) {
    //         throw new Error('Lấy dữ liệu phiên làm việc thất bại: ' + error.message);
    //     }
    // }

    static async getUserSessionData(userId) {
        try {
            const query = `
                SELECT 
                    u.id, u.name, u.email, u.phoneNumber, u.avatar,
                    r.roleName AS role,
                    w.balance, w.frozenAmount,
                    sa.fullAddress AS diaChi -- Lấy địa chỉ từ bảng shippingaddress
                FROM user u
                LEFT JOIN userrole ur ON u.id = ur.user_id
                LEFT JOIN role r ON ur.role_id = r.id
                LEFT JOIN wallet w ON u.id = w.userId
                LEFT JOIN shippingaddress sa ON u.id = sa.user_id AND sa.isDefault = 1 -- Lấy địa chỉ mặc định
                WHERE u.id = ?
            `;
            const [rows] = await execute(query, [userId]);
            return rows[0] ?? null;
        } catch (error) {
            throw new Error('Lấy dữ liệu phiên làm việc thất bại: ' + error.message);
        }
    }

    static async updateAvatar(userId, fileName) {
        const sql = "UPDATE user SET Avatar = ? WHERE id = ?";
        const [result] = await execute(sql, [fileName, userId]);
        return result.affectedRows > 0;
    }

    static async updateProfile(userId, userData) {
        try {
            const {
                name,
                email,
                phoneNumber
            } = userData;

            const query = `
                UPDATE user
                SET
                    name = ?,
                    email = ?,
                    phoneNumber = ?
                WHERE id = ?
            `;

            const [result] = await execute(query, [
                name,
                email,
                phoneNumber,
                userId
            ]);

            return result.affectedRows > 0;

        } catch (error) {
            throw new Error("Cập nhật hồ sơ thất bại: " + error.message);
        }
    }

    static async updatePassword(id, hashedPassword) {
        try {
            const query = `UPDATE user SET password = ? WHERE id = ?`;
            const [result] = await execute(query, [hashedPassword, id]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error('Lỗi cập nhật mật khẩu: ' + error.message);
        }
    }


    static async getAllUsers(status, search) {
        let query = `
            SELECT 
                u.id, u.name, u.email, u.phoneNumber,u.avatar, u.createdAt, u.status, 
                r.roleName as role,
                EXISTS(SELECT 1 FROM product p WHERE p.ownerId = u.id) as isOwner
            FROM user u
            JOIN userrole ur ON u.id = ur.user_id
            JOIN role r ON ur.role_id = r.id
            WHERE 1=1
        `;
        const params = [];
        if (status && status !== '') {
            query += " AND u.status = ?";
            params.push(status);
        }
        if (search && search !== '') {
            query += " AND (u.name LIKE ? OR u.email LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        const [rows] = await execute(query, params);
        return rows;
    }

    static async getUserStats() {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM user) as totalUsers,
                (SELECT COUNT(DISTINCT ownerId) FROM product) as ownerUsers,
                (SELECT COUNT(*) FROM user u JOIN userrole ur ON u.id = ur.user_id JOIN role r ON ur.role_id = r.id WHERE r.roleName = 'Admin') as adminUsers
        `;
        const [rows] = await execute(query);
        return rows[0];
    }

    static async updateStatus(userId, status) {
        const query = "UPDATE user SET status = ? WHERE id = ?";
        return await execute(query, [status, userId]);
    }
}