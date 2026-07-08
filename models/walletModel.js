import { execute, beginTransaction, commitTransaction, rollbackTransaction } from '../config/db.js';

export default class WalletModel {
    static async getWalletByUserId(userId) {
        try {
           
            const query = `
                SELECT id, userId, balance, frozenAmount, updatedAt 
                FROM wallet 
                WHERE userId = ?
            `;
            
            const [rows] = await execute(query, [userId]);
            
           
            if (rows.length === 0) {
                return { balance: 0.00, frozenAmount: 0.00 };
            }
            
            
            const walletData = rows[0];
            walletData.balance = parseFloat(walletData.balance) || 0.00;
            walletData.frozenAmount = parseFloat(walletData.frozenAmount) || 0.00;
            

            return walletData;
            
        } catch (error) {
            throw new Error('Lấy thông tin số dư ví từ hệ thống thất bại: ' + error.message);
        }
    }

    static async getWalletIdByUserId(userId) {
        const [rows] = await execute("SELECT id FROM wallet WHERE userId = ?", [userId]);
        return rows.length > 0 ? rows[0].id : null;
    }

    static async createTransaction(walletId, amount, type = 'Deposit', status = 'Pending') {
        const [result] = await execute(
            "INSERT INTO wallettransaction (walletId, transactionType, amount, status) VALUES (?, ?, ?, ?)",
            [walletId, type, amount, status]
        );
        return result.insertId;
    }

    static async updateBalanceAndStatus(transactionId, walletId, amount) {
        const connection = await beginTransaction();
        try {
            await connection.execute(
                "UPDATE wallet SET balance = balance + ? WHERE id = ?", 
                [amount, walletId]
            );
            
            await connection.execute(
                "UPDATE wallettransaction SET status = 'Success' WHERE id = ?", 
                [transactionId]
            );
            await commitTransaction(connection);
            return true;
            
        } catch (error) {
            await rollbackTransaction(connection);
            throw error; 
        }
    }
}