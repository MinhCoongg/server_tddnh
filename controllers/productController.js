import productModel from '../models/productModel.js';
import path from 'path'; 
import fs from 'fs';
import cloudinary from '../config/cloudinary.js';

export default class productController {

   
    static async getAllProducts(req, res) {
        try {
            const products = await productModel.getAll();
            res.status(200).json({ succeeded: true, data: products });
        } catch (error) {
            res.status(500).json({ succeeded: false, message: error.message });
        }
    }

    
    static async getProductDetail(req, res) {
        try {
            const { id } = req.params;
            const product = await productModel.getById(id);
            
            if (!product) {
                return res.status(404).json({ succeeded: false, message: 'Không tìm thấy sản phẩm này trong hệ thống!' });
            }

            res.status(200).json({ succeeded: true, data: product });
        } catch (error) {
            res.status(500).json({ succeeded: false, message: error.message });
        }
    }

    
    static async postProduct(req, res) {
        try {
            if (!req.user || !req.user.id) {
                return res.status(401).json({ succeeded: false, message: "Yêu cầu quyền truy cập! Vui lòng đăng nhập tài khoản Chủ kho đồ." });
            }
            const ownerId = req.user.id;
            
            let productData;
            if (req.body.body) {
                try {
                    productData = typeof req.body.body === 'string' ? JSON.parse(req.body.body) : req.body.body;
                } catch (e) {
                    return res.status(400).json({ succeeded: false, message: "Cấu trúc dữ liệu trường 'body' gửi lên không đúng định dạng JSON!" });
                }
            } else {
                productData = req.body;
            }

           if (req.files && req.files.images) {
                let files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
                let uploadedUrls = [];

                for (const file of files) {
                    const result = await new Promise((resolve, reject) => {
                        cloudinary.uploader.upload_stream(
                            { folder: "products" }, 
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        ).end(file.data); 
                    });
                    
                    uploadedUrls.push(result.secure_url); 
                }

                if (!productData.basicInfo) productData.basicInfo = {}; 
                productData.basicInfo.images = uploadedUrls;
            }

           
            const newProductId = await productModel.create(ownerId, productData);

            const productCode = `PRD-2026-${String(newProductId).padStart(6, '0')}`;

            res.status(201).json({ 
                succeeded: true, 
                message: 'Đăng sản phẩm cho thuê thành công! Hệ thống đã ghi nhận lịch sử kho bãi.',
                data: { 
                    productId: newProductId,
                    productCode: productCode 
                }
            });

        } catch (error) {
            console.error("Lỗi xử lý tại productController:", error); 
            res.status(500).json({ succeeded: false, message: 'Lỗi tiến trình xử lý: ' + error.message });
        }
    }


    static async getCategoryFields(req, res) {
        try {
            const { id } = req.params;
            const fields = await productModel.getFieldsByCategoryId(id);
            res.status(200).json({ 
                succeeded: true, 
                data: fields 
            });
        } catch (error) {
            res.status(500).json({ 
                succeeded: false, 
                message: 'Lỗi lấy thuộc tính động: ' + error.message 
            });
        }
    }

    static async getProductsFilter(req, res) {
        try {
            const filters = {
            categoryId: req.body.categoryId,
            priceMin: req.body.priceMin,
            priceMax: req.body.priceMax,
            location: req.body.location,
            sortBy: req.body.sortBy,
            keyword: req.body.keyword
        };
            const products = await productModel.getAllFiltered(filters);
            res.status(200).json({ success: true, data: products });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getMyProducts(req, res){
        try {
            console.log("User ID đang lấy được là:", req.user?.id); 
            const userId = req.user.id;
            const products = await productModel.findByOwnerId(userId); 
            console.log("Số sản phẩm tìm được:", products.length); 
            
            res.status(200).json({ success: true, data: products });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    };

    static async getShopProducts(req, res) {
        try {
            const { shopId } = req.params; 
            const products = await productModel.getByShopId(shopId);
            
            res.status(200).json({ 
                succeeded: true, 
                data: products 
            });
        } catch (error) {
            res.status(500).json({ 
                succeeded: false, 
                message: error.message 
            });
        }
    }

    static async getMyProductStatus(req, res){
        try {
            const ownerId = req.user.id; 
            const products = await productModel.getProductsByOwner(ownerId);
            res.json({ succeeded: true, data: products });
        } catch (error) {
            res.status(500).json({ succeeded: false, message: error.message });
        }
    };

    static async toggleStatus(req, res){
        try {
            const { productId, status } = req.body;
            const ownerId = req.user.id;
            await productModel.updateProductStatus(productId, ownerId, status);
            res.json({ succeeded: true, message: "Cập nhật thành công!" });
        } catch (error) {
            res.status(400).json({ succeeded: false, message: error.message });
        }
    };


    static async getProducts(req, res) {
        try {
            const { status, search } = req.query;
            const products = await productModel.getProductsByStatus(status, search);
            const formattedProducts = products.map(p => ({
                ...p,
                datePosted: new Date(p.datePosted).toLocaleDateString('vi-VN')
            }));
            
            res.status(200).json({ success: true, data: formattedProducts });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async approveProduct(req, res) {
        try {
            const { productId, status } = req.body; // status: 'Available' hoặc 'Hidden'
            const success = await productModel.updateStatus(productId, status);

            if (success) {
                res.status(200).json({ success: true, message: "Cập nhật trạng thái thành công" });
            } else {
                res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" });
            }
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}