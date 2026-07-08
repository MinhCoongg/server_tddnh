import CategoryModel from '../models/categoriesModel.js';

export default class categoryController {
    

    static async getAllCategories(req, res) {
        try {
            const categoryTree = await CategoryModel.getCategoryTree();
            
          
            res.status(200).json({
                succeeded: true,
                message: "Tải danh mục hệ thống phân tầng lấp lánh thành công!",
                data: categoryTree
            });
        } catch (error) {
            res.status(500).json({
                succeeded: false,
                message: "Lỗi Server khi tải danh mục: " + error.message
            });
        }
    }
}