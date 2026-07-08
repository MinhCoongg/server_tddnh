import { execute } from '../config/db.js';

export default class AddressModel {
    static async getAddressesByUserId(userId) {
        try {
            const query = `
                SELECT id, user_id, receiverName, receiverPhone, fullAddress, isDefault 
                FROM shippingaddress 
                WHERE user_id = ? 
                ORDER BY isDefault DESC, id DESC
            `;
            
            const [rows] = await execute(query, [userId]);
            return rows;
            
        } catch (error) {
            throw new Error('Lấy danh sách sổ địa chỉ hệ thống thất bại: ' + error.message);
        }
    }

    static async createAddress(addressData) {
        try {
            const { userId, receiverName, receiverPhone, fullAddress, isDefault } = addressData;
            
            const query = `
                INSERT INTO shippingaddress (user_id, receiverName, receiverPhone, fullAddress, isDefault) 
                VALUES (?, ?, ?, ?, ?)
            `;
            
            const [result] = await execute(query, [userId, receiverName, receiverPhone, fullAddress, isDefault || 0]);
            return result.insertId; 
            
        } catch (error) {
            throw new Error('Thêm mới địa chỉ kho bãi thất bại: ' + error.message);
        }
    }

    static async updateAddress(id, userId, addressData) {
        try {
            const { receiverName, receiverPhone, fullAddress, isDefault } = addressData;
            if (isDefault) {
                await execute('UPDATE shippingaddress SET isDefault = 0 WHERE user_id = ?', [userId]);
            }

            const query = `
                UPDATE shippingaddress 
                SET receiverName = ?, receiverPhone = ?, fullAddress = ?, isDefault = ? 
                WHERE id = ? AND user_id = ?
            `;
            const [result] = await execute(query, [receiverName, receiverPhone, fullAddress, isDefault ? 1 : 0, id, userId]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error('Cập nhật địa chỉ thất bại: ' + error.message);
        }
    }

    static async deleteAddress(id, userId) {
        try {
            const query = 'DELETE FROM shippingaddress WHERE id = ? AND user_id = ?';
            const [result] = await execute(query, [id, userId]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error('Xóa địa chỉ thất bại: ' + error.message);
        }
    }
}