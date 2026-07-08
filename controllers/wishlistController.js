import WishListModel from "../models/wishlistModel.js";

export default class WishListController{
    static async toggleWishlist(req, res) {
        try {
            const userId = req.user.id; 
            const { productId } = req.body;

            if (!productId) {
                return res.status(400).json({ success: false, message: "Thiếu productId" });
            }

            const exists = await WishListModel.checkExists(userId, productId);

            if (exists) {
                await WishListModel.removeFromWishlist(userId, productId);
                return res.status(200).json({ success: true, message: "Đã xóa khỏi danh sách yêu thích" });
            } else {
                await WishListModel.addToWishlist(userId, productId);
                return res.status(200).json({ success: true, message: "Đã thêm vào danh sách yêu thích" });
            }
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }


    static async getWishlist(req, res) {
        try {
            const userId = req.user.id;
            const products = await WishListModel.getWishlistByUserId(userId);
            
            return res.status(200).json({
                success: true,
                data: products
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
}