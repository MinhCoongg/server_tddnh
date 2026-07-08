import AddressModel from '../models/addressModel.js'; 

export default class AddressController {

    static async getUserAddresses(req, res) {
        try {
            const userId = req.user.id; 
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Không tìm thấy thông tin xác thực người dùng!"
                });
            }
            const addresses = await AddressModel.getAddressesByUserId(userId);
            return res.status(200).json({
                success: true,
                message: "Tải danh sách sổ địa chỉ kho bãi thành công!",
                data: addresses
            });

        } catch (error) {
            console.error("Lỗi không lấy được danh sách tại AddressController:", error.message);
            return res.status(500).json({
                success: false,
                message: "Lỗi hệ thống: " + error.message
            });
        }
    }

    static async createAddress(req, res) {
        try {
            const userId = req.user.id; 
            if (!userId) {
                return res.status(401).json({ success: false, message: "Không tìm thấy thông tin xác thực người dùng!" });
            }

            const { receiverName, receiverPhone, fullAddress, isDefault } = req.body;

            if (!receiverName || !receiverPhone || !fullAddress) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng nhập đầy đủ tên kho, số điện thoại và địa chỉ chi tiết!"
                });
            }

            const newAddressId = await AddressModel.createAddress({
                userId,
                receiverName: receiverName.trim(),
                receiverPhone: receiverPhone.trim(),
                fullAddress: fullAddress.trim(),
                isDefault: isDefault === true || isDefault === 1 ? 1 : 0 
            });

            
            return res.status(201).json({
                success: true,
                message: "Thêm địa chỉ kho bãi mới thành công!",
                data: {
                    id: newAddressId,
                    userId,
                    receiverName,
                    receiverPhone,
                    fullAddress,
                    isDefault: isDefault === true || isDefault === 1
                }
            });

        } catch (error) {
            console.error("Lỗi tại AddressController (Create):", error.message);
            return res.status(500).json({
                success: false,
                message: "Lỗi hệ thống: " + error.message
            });
        }
    }

    static async updateAddress(req, res) {
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const { receiverName, receiverPhone, fullAddress, isDefault } = req.body;

            if (!id) return res.status(400).json({ success: false, message: "Thiếu ID địa chỉ!" });

            const success = await AddressModel.updateAddress(id, userId, {
                receiverName: receiverName?.trim(),
                receiverPhone: receiverPhone?.trim(),
                fullAddress: fullAddress?.trim(),
                isDefault: isDefault
            });

            if (!success) {
                return res.status(404).json({ success: false, message: "Không tìm thấy địa chỉ hoặc không có quyền cập nhật!" });
            }

            return res.status(200).json({ success: true, message: "Cập nhật địa chỉ thành công!" });

        } catch (error) {
            console.error("Lỗi tại AddressController (Update):", error.message);
            return res.status(500).json({ success: false, message: "Lỗi hệ thống: " + error.message });
        }
    }

    static async deleteAddress(req, res) {
        try {
            const userId = req.user.id;
            const { id } = req.params;

            if (!id) return res.status(400).json({ success: false, message: "Thiếu ID địa chỉ!" });

            const success = await AddressModel.deleteAddress(id, userId);

            if (!success) {
                return res.status(404).json({ success: false, message: "Địa chỉ không tồn tại hoặc bạn không có quyền xóa!" });
            }

            return res.status(200).json({ success: true, message: "Xóa địa chỉ thành công!" });

        } catch (error) {
            console.error("Lỗi tại AddressController (Delete):", error.message);
            return res.status(500).json({ success: false, message: "Lỗi hệ thống: " + error.message });
        }
    }
}