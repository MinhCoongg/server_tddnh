import path from "path";
import ReviewModel from "../models/reviewModel.js";
import cloudinary from '../config/cloudinary.js';
export default class ReviewController {
    static async getByProduct(req, res) {
        try {
            const { productId } = req.params;

            const reviews = await ReviewModel.getReviewsByProduct(productId);
            return res.status(200).json({
                success: true,
                data: reviews
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }


    static async addReview(req, res) {
        try {
            const userId = req.user.id;
            const { invoiceDetailId, productId, rating, comment } = req.body;

            if (!invoiceDetailId || !productId || !rating) {
                return res.status(400).json({ success: false, message: "Thiếu dữ liệu." });
            }

            const eligible = await ReviewModel.checkEligibility(userId, invoiceDetailId, productId);
            if (!eligible) {
                return res.status(403).json({ success: false, message: "Bạn đã đánh giá sản phẩm này rồi!" });
            }

            let imageUrls = [];
            if (req.files && req.files.images) { 
                let files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
                
                for (const file of files) {
                    const result = await new Promise((resolve, reject) => {
                        cloudinary.uploader.upload_stream(
                            { folder: "reviews" }, 
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        ).end(file.data);
                    });
                    imageUrls.push(result.secure_url); 
                }
            }

            await ReviewModel.addReview({
                invoiceDetailId,
                userId,
                productId,
                rating,
                comment,
                images: imageUrls 
            });

            return res.status(200).json({
                success: true,
                message: "Đánh giá thành công."
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}
