import { execute } from '../config/db.js';
import { BASE_URL } from '../config/constants.js';
export default class CategoryModel {

    static async getCategoryTree() {
        try {
            
            const query = `SELECT id, parentId, categoryName, categoryImage FROM category ORDER BY id ASC`;
            const [rows] = await execute(query);
            const mainCategories = rows.filter(cat => cat.parentId === null).map(main => ({
                id: main.id,
                categoryName: main.categoryName,
                categoryImage: main.categoryImage ? `${main.categoryImage}` : null,
                subCategories: [] 
            }));

           
            rows.forEach(cat => {
                if (cat.parentId !== null) {
                    const parent = mainCategories.find(main => main.id === cat.parentId);
                    if (parent) {
                        parent.subCategories.push({
                            id: cat.id,
                            parentId: cat.parentId,
                            categoryName: cat.categoryName,
                            categoryImage: cat.categoryImage ? `${cat.categoryImage}` : null 
                        });
                    }
                }
            });

            return mainCategories;
        } catch (error) {
            throw new Error('Lấy cây danh mục hệ thống thất bại: ' + error.message);
        }
    }
}