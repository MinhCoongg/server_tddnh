import { RentalModel } from '../models/rentalModel.js';
import { execute } from '../config/db.js';
import path from 'path'; 
import fs from 'fs';
import cloudinary from '../config/cloudinary.js';
export default class RentalController {

    static async createOrder(req, res) {
        try {
            const renterId = req.user.id; 
            if (!renterId) {
                return res.status(401).json({
                    success: false,
                    message: "Không tìm thấy thông tin xác thực người dùng!"
                });
            }

            const {
                startDate,
                endDate,
                shippingMethod,
                receiverName,
                receiverPhone,
                fullAddress,
                shippingFee,
                rentalFee,
                depositFee,
                totalAmount,
                items
            } = req.body;

            if (!startDate || !endDate || !shippingMethod || !items || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng điền đầy đủ thông tin thời gian thuê, hình thức nhận và danh sách sản phẩm!"
                });
            }

            const result = await RentalModel.createRentalOrder({
                renterId,
                startDate,
                endDate,
                shippingMethod,
                receiverName,
                receiverPhone,
                fullAddress,
                shippingFee: Number(shippingFee || 0),
                rentalFee: Number(rentalFee || 0),
                depositFee: Number(depositFee || 0),
                totalAmount: Number(totalAmount || 0),
                items
            });

            return res.status(201).json({
                success: true,
                message: "Đặt đơn hàng thành công! Vui lòng chờ chủ shop duyệt đơn.",
                data: result
            });

        } catch (error) {
            console.error("Lỗi tại RentalController (createOrder):", error.message);
            return res.status(500).json({
                success: false,
                message: error.message || "Lỗi hệ thống khi tạo đơn hàng!"
            });
        }
    }


    static async approveRequest(req, res) {
        try {
            const { rentalRequestId, rejectedItems } = req.body;

            if (!rentalRequestId) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng cung cấp mã đơn thuê cần duyệt!"
                });
            }

            const result = await RentalModel.approveRentalRequest(rentalRequestId, rejectedItems);

            return res.status(200).json({
                success: true,
                message: result.message
            });

        } catch (error) {
            console.error("Lỗi tại RentalController (approveRequest):", error.message);
            return res.status(500).json({
                success: false,
                message: "Lỗi hệ thống khi duyệt đơn hàng!"
            });
        }
    }


    static async rejectRequest(req, res) {
        try {
            const { rentalRequestId, cancelReason } = req.body;

            if (!rentalRequestId) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng cung cấp mã đơn thuê cần từ chối (rentalRequestId)!"
                });
            }

            const result = await RentalModel.rejectRentalRequest(rentalRequestId, cancelReason);

            return res.status(200).json({
                success: true,
                message: result.message
            });

        } catch (error) {
            console.error("Lỗi tại RentalController (rejectRequest):", error.message);
            return res.status(500).json({
                success: false,
                message: error.message || "Lỗi hệ thống khi từ chối đơn hàng!"
            });
        }
    }


    static async getBookedDates(req, res) {
        try {
            const { productIds } = req.body;

            if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
                return res.status(200).json({
                    success: true,
                    bookedDates: []
                });
            }

            const bookedDates = await RentalModel.getUnavailableDates(productIds);

            return res.status(200).json({
                success: true,
                message: "Tải danh sách ngày bận của sản phẩm thành công!",
                bookedDates: bookedDates
            });

        } catch (error) {
            console.error("Lỗi tại RentalController (getBookedDates):", error.message);
            return res.status(500).json({
                success: false,
                message: "Lỗi hệ thống: " + error.message
            });
        }
    }

    


    static async getOrderDetailById(req, res) {
        try {
            const { id } = req.params;
            const currentUserId = req.user.id; 

            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng cung cấp mã đơn thuê cần xem chi tiết!"
                });
            }

            const order = await RentalModel.getOrderDetails(id);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: "Không tìm thấy đơn thuê yêu cầu!"
                });
            }

           
            const isRenter = order.renterId === currentUserId; 
            const isOwner = order.ownerId === currentUserId;   

            if (!isRenter && !isOwner) {
                return res.status(403).json({
                    success: false,
                    message: "Cảnh báo bảo mật: Bạn không có quyền truy cập vào thông tin đơn hàng của người khác!"
                });
            }

            return res.status(200).json({
                success: true,
                message: "Tải thông tin chi tiết đơn thuê thành công!",
                data: order
            });

        } catch (error) {
            console.error("Lỗi tại RentalController (getOrderDetailById):", error.message);
            return res.status(500).json({
                success: false,
                message: "Lỗi hệ thống: " + error.message
            });
        }
    }

    static async cancelOrder(req, res) {
        try {
            const { rentalRequestId } = req.body;

            if (!rentalRequestId) {
                return res.status(400).json({
                    success: false,
                    message: "Thiếu mã đơn thuê (rentalRequestId) rồi "
                });
            }

            const result = await RentalModel.cancelRentalRequestByUser(rentalRequestId);

            
            return res.status(200).json({
                success: true,
                message: result.message
            });

        } catch (error) {
            console.error("Lỗi tại RentalController.cancelOrder:", error.message);
            return res.status(500).json({
                success: false,
                message: error.message || "Lỗi hệ thống, không thể hủy đơn lúc này!"
            });
        }
    }

    static async getOwnerStats(req, res) {
        try {
            const ownerId = req.user.id; 
            
            if (!ownerId) {
                return res.status(401).json({
                    success: false,
                    message: "Không tìm thấy thông tin xác thực chủ shop!"
                });
            }

            const stats = await RentalModel.getOwnerPendingStats(ownerId);

            return res.status(200).json({
                success: true,
                message: "Tải số liệu thống kê đơn chờ duyệt thành công!",
                data: {
                    totalPendingOrders: stats.totalPendingOrders,
                    totalPendingValue: Number(stats.totalPendingValue)
                }
            });
        } catch (error) {
            console.error("Lỗi tại RentalController (getOwnerStats):", error.message);
            return res.status(500).json({
                success: false,
                message: "Lỗi hệ thống: " + error.message
            });
        }
    }

    static async rejectRequest(req, res) {
        try {
            const { rentalRequestId, cancelReason } = req.body;

            if (!rentalRequestId) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng cung cấp mã đơn thuê cần từ chối (rentalRequestId)!"
                });
            }

            const finalReason = cancelReason && cancelReason.trim() !== "" 
                ? cancelReason 
                : "Chủ shop từ chối duyệt đơn";

          
            const result = await RentalModel.rejectRentalRequest(rentalRequestId, finalReason);

            return res.status(200).json({
                success: true,
                message: result.message
            });

        } catch (error) {
            console.error("Lỗi tại RentalController (rejectRequest):", error.message);
            return res.status(500).json({
                success: false,
                message: error.message || "Lỗi hệ thống khi thực hiện từ chối đơn hàng!"
            });
        }
    }

    static async fetchMyOrders(req, res) {
        try {
            const userId = req.user.id; 
            const { status, role } = req.query; 
            let orders;
            if (role === 'owner') {
                orders = await RentalModel.getOwnerOrders(userId, status);
            } else {
                orders = await RentalModel.getRenterOrders(userId, status);
            }

            return res.status(200).json({
                success: true,
                message: "Tải danh sách đơn hàng thành công!",
                data: orders
            });
            
        } catch (error) {
            console.error("Lỗi quét trạng thái động tại fetchMyOrders:", error.message);
            return res.status(500).json({ success: false, message: error.message });
        }
    }

//    static async renterReturnOrder(req, res) {
//         try {
//             const { rentalRequestId, trackingNumber, note } = req.body; 

//             if (!rentalRequestId) {
//                 return res.status(400).json({ success: false, message: "Thiếu ID đơn hàng!" });
//             }

//             let returnProofUrl = ""; 
//             if (req.files && req.files.returnProof) {
//                 const file = req.files.returnProof; // Lấy file từ req.files
//                 const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
//                 const uploadPath = path.join(process.cwd(), 'uploads', fileName);
                
//                 await file.mv(uploadPath); 
//                 returnProofUrl = `/uploads/${fileName}`; 
//             }

//             const isUpdated = await RentalModel.renterReturnOrder(
//                 rentalRequestId, 
//                 returnProofUrl, 
//                 trackingNumber || "", 
//                 note || ""
//             );

//             if (!isUpdated) {
//                 return res.status(400).json({ success: false, message: "Cập nhật thất bại!" });
//             }

//             return res.status(200).json({ success: true, message: "Báo trả hàng thành công!" });
//         } catch (error) {
//             console.error("Lỗi tại Controller renterReturnOrder:", error);
//             return res.status(500).json({ success: false, message: error.message });
//         }
//     }



    static async renterReturnOrder(req, res) {
        try {
            const { rentalRequestId, trackingNumber, note } = req.body; 

            if (!rentalRequestId) {
                return res.status(400).json({ success: false, message: "Thiếu ID đơn hàng!" });
            }

            let returnProofUrl = ""; 
            if (req.files && req.files.returnProof) {
                const file = req.files.returnProof; 
                const result = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { folder: "rental_proofs" }, 
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    ).end(file.data);
                });
                
                returnProofUrl = result.secure_url; 
            }

            const isUpdated = await RentalModel.renterReturnOrder(
                rentalRequestId, 
                returnProofUrl, 
                trackingNumber || "", 
                note || ""
            );

            if (!isUpdated) {
                return res.status(400).json({ success: false, message: "Cập nhật thất bại!" });
            }

            return res.status(200).json({ success: true, message: "Báo trả hàng thành công!" });
        } catch (error) {
            console.error("Lỗi tại Controller renterReturnOrder:", error);
            return res.status(500).json({ success: false, message: error.message });
        }
    }


    // static async reportDamage(req, res){
    //     try {
    //         const { rentalRequestId, note, compensation } = req.body;

    //         if (!rentalRequestId || !compensation) {
    //             return res.status(400).json({ success: false, message: "Thiếu thông tin báo cáo!" });
    //         }


    //         let proofUrl = "";
    //         if (req.files && req.files.proof) {
    //             const file = req.files.proof;
    //             const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    //             const uploadPath = path.join(process.cwd(), 'uploads', fileName);
    //             await file.mv(uploadPath);
    //             proofUrl = `/uploads/${fileName}`;
    //         }

    //         await RentalModel.reportDamage(
    //             rentalRequestId, 
    //             note || "", 
    //             compensation, 
    //             proofUrl
    //         );

    //         return res.status(200).json({ success: true, message: "Đã gửi báo cáo nghiệm thu cho khách!" });
    //     } catch (error) {
    //         console.error("Lỗi tại Controller reportDamage:", error);
    //         return res.status(500).json({ success: false, message: error.message });
    //     }
    // };

    static async reportDamage(req, res) {
        try {
            const { rentalRequestId, note, compensation } = req.body;

            if (!rentalRequestId || !compensation) {
                return res.status(400).json({ success: false, message: "Thiếu thông tin báo cáo!" });
            }

            let proofUrl = "";
            if (req.files && req.files.proof) {
                const file = req.files.proof;

                const result = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { folder: "damage_proofs" }, 
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    ).end(file.data);
                });
                
                proofUrl = result.secure_url;
            }

            await RentalModel.reportDamage(
                rentalRequestId, 
                note || "", 
                compensation, 
                proofUrl 
            );

            return res.status(200).json({ success: true, message: "Đã gửi báo cáo nghiệm thu cho khách!" });
        } catch (error) {
            console.error("Lỗi tại Controller reportDamage:", error);
            return res.status(500).json({ success: false, message: error.message });
        }
    }

     static async getProductPolicies (req, res) {
        try {
            const { productId } = req.params;

            const policies = await RentalModel.getPoliciesByProductId(productId);
 
            return res.status(200).json({ success: true, data: policies });
        } catch (error) {
            console.error("Lỗi tại Controller getProductPolicies:", error);
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getDamageReport (req, res) {
        try {
            const { rentalRequestId } = req.params;

            const policies = await RentalModel.getDamageReportByRentalId(rentalRequestId)
 
            return res.status(200).json({ success: true, data: policies });
        } catch (error) {
            console.error("Lỗi tại Controller getDamageReportByRentalId:", error);
            return res.status(500).json({ success: false, message: error.message });
        }
    }

 

    static async acceptDamageReport(req, res) {
        try {
            const { rentalRequestId } = req.params;
            
            if (!rentalRequestId) {
                return res.status(400).json({ success: false, message: "Thiếu ID đơn hàng!" });
            }

            const result = await RentalModel.acceptDamageReport(rentalRequestId);
            
            return res.status(200).json(result);

        } catch (error) {
            console.error("Lỗi Controller acceptDamageReport:", error.message);
            return res.status(500).json({ 
                success: false, 
                message: error.message || "Có lỗi xảy ra khi xử lý đồng ý báo cáo!" 
            });
        }
    };
}