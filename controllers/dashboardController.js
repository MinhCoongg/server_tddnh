import AdminModel from "../models/dashboardModel.js";

export default class AdminController{
    static async getDashboardData(req, res) {
        try {
            const stats = await AdminModel.getDashboardStats();
            const monthlyOrders = await AdminModel.getMonthlyStats();
            
            res.status(200).json({
                success: true,
                data: {
                    stats: stats,
                    monthlyOrders: monthlyOrders
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getTopCategories(req, res) {
        try {
            const data = await AdminModel.getTopRentedCategories();
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getAllOrders(req, res) {
        try {
            console.log("Dữ liệu gửi lên là: ",  req.query)
            const { status, search} = req.query;
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 5;
            const [orders, stats] = await Promise.all([
                AdminModel.getAllSystemOrders(status, search, page, limit),
                AdminModel.getRentalStats()
            ]);

            return res.status(200).json({
                success: true,
                data: orders,
                stats: stats 
            });
        } catch (error) {
            console.error("LỖI THẬT SỰ TẠI AdminRentalController:", error);
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    
}