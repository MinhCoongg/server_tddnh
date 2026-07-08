import TierModel from "../models/priceModel.js";

export default class PricingController {

    static async getPriceByProduct(req, res) {
        try {
            const { productId } = req.query;

            if (!productId) {
                return res.status(400).json({
                    success: false,
                    message: "Thiếu thông tin ID sản phẩm (productId)"
                });
            }


            const pricingTiers = await TierModel.getTiersByProductId(productId);

            return res.status(200).json({
                success: true,
                message: `Lấy bảng bậc giá của sản phẩm ${productId} thành công`,
                data: pricingTiers 
            })

        } catch (error) {
            console.error("Lỗi không lấy được bảng giá tại PricingController:", error.message);
            return res.status(500).json({
                success: false,
                message: "Lỗi hệ thống khi quét bảng giá sản phẩm: " + error.message
            });
        }
    }
}