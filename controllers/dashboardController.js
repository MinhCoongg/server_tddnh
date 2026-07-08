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
            const { status, search, page, limit } = req.query;
            const [orders, stats] = await Promise.all([
                AdminModel.getAllSystemOrders(status, search, parseInt(page) || 1, parseInt(limit) || 5),
                AdminModel.getRentalStats()
            ]);

            return res.status(200).json({
                success: true,
                data: orders,
                stats: stats 
            });
        } catch (error) {
            console.error("Lỗi tại AdminRentalController:", error.message);
            return res.status(500).json({ success: false, message: "Lỗi hệ thống!" });
        }
    }

    
}