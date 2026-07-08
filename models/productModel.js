import { BASE_URL } from '../config/constants.js';
import { beginTransaction, commitTransaction, execute, rollbackTransaction } from '../config/db.js';

export default class productModel {
    static async getAll() {
    try {
        const baseQuery = `
            SELECT 
                p.id, p.ownerId, p.categoryId, p.addressId, p.title, 
                p.depositAmount, 
                 (
                    SELECT MIN(pricePerDay)
                    FROM producttierpricing ptp
                    WHERE ptp.productId = p.id
                ) AS minPrice,
                p.quantity, p.status, p.createdAt,
                sa.fullAddress as location,
                (SELECT imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as thumbnail,
                COALESCE(ROUND(AVG(r.rating), 1), 5.0) as rating, 
                COUNT(r.id) as reviewCount 
            FROM product p
            LEFT JOIN shippingaddress sa ON p.addressId = sa.id
            LEFT JOIN review r ON p.id = r.productId
            WHERE p.status = 'Available'
            GROUP BY p.id
        `;

        const [featuredRows] = await execute(`
            SELECT 
                p.id, p.ownerId, p.categoryId, p.addressId, p.title, 
                p.depositAmount, 
                (SELECT MIN(pricePerDay) FROM producttierpricing ptp WHERE ptp.productId = p.id) AS minPrice,
                p.quantity, p.status, p.createdAt,
                sa.fullAddress as location,
                (SELECT imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as thumbnail,
                COALESCE((SELECT ROUND(AVG(rating), 1) FROM review WHERE productId = p.id), 5.0) as rating,
                (SELECT COUNT(*) FROM review WHERE productId = p.id) as reviewCount,
                COALESCE((SELECT SUM(quantity) FROM rentalrequestdetail WHERE productId = p.id), 0) as totalRented
            FROM product p
            LEFT JOIN shippingaddress sa ON p.addressId = sa.id
            WHERE p.status = 'Available'
            ORDER BY totalRented DESC, p.id ASC
            LIMIT 10
        `);

        const [shopRows] = await execute(`
            SELECT 
                u.id, 
                u.name, 
                u.avatar,
                COUNT(DISTINCT p.id) as totalProducts, 
                COALESCE(ROUND(AVG(r.rating), 1), 5.0) as shopRating, 
                COUNT(r.id) as totalReviews 
            FROM user u
            JOIN product p ON u.id = p.ownerId
            LEFT JOIN review r ON p.id = r.productId
            WHERE p.status = 'Available'
            GROUP BY u.id
            HAVING shopRating >= 4.5 
            ORDER BY totalReviews DESC, shopRating DESC
            LIMIT 10
        `);


        const [newestRows] = await execute(`
            ${baseQuery}
            ORDER BY p.createdAt DESC 
            LIMIT 10
        `);


        const [suggestedRows] = await execute(`
            ${baseQuery}
            ORDER BY RAND() 
            LIMIT 10
        `);

        const mapThumbnailAndLocation = (rows) => {
            return rows.map(row => {
                let formattedLocation = "TP. Hồ Chí Minh";
                if (row.location) {
                    const parts = row.location.split(',');
                    if (parts.length >= 2) {
                        formattedLocation = `${parts[parts.length - 2].trim()}`;
                    } else {
                        formattedLocation = row.location;
                    }
                }

                return {
                    ...row,
                    location: formattedLocation, 
                    thumbnail: row.thumbnail 
                };
            });
        };

        const trustedShops = shopRows.map(shop => ({
        ...shop,
        avatar: shop.avatar 
    }));

    return {
        featuredProducts: mapThumbnailAndLocation(featuredRows),
        newestProducts: mapThumbnailAndLocation(newestRows),
        suggestedProducts: mapThumbnailAndLocation(suggestedRows),
        trustedShops: trustedShops 
    };
    } catch (error) {
        throw new Error('Lấy danh sách phân loại sản phẩm trang chủ thất bại: ' + error.message);
    }
}

    
   static async getById(id) {
    try {
        const [productRows] = await execute(`
            SELECT 
                p.id, p.ownerId, p.categoryId, p.addressId, p.title, 
                p.description, p.depositAmount, p.quantity, p.status, p.createdAt,
                u.name as ownerName, u.avatar as ownerAvatar, c.categoryName,
                sa.receiverName as shopReceiverName,
                sa.receiverPhone as shopReceiverPhone,
                sa.fullAddress as shopAddress,
                sa.fullAddress as location
            FROM product p 
            JOIN user u ON p.ownerId = u.id 
            JOIN category c ON p.categoryId = c.id 
            LEFT JOIN shippingaddress sa ON p.addressId = sa.id
            WHERE p.id = ?`, [id]);

        if (productRows.length === 0) return null;
        let product = productRows[0];
        
        if (product.ownerAvatar) {
            product.ownerAvatar = `${product.ownerAvatar}`;
        }

        product.shopInfo = {
            receiverName: product.shopReceiverName,
            receiverPhone: product.shopReceiverPhone,
            address: product.shopAddress
        };

        if (product.location) {
            const parts = product.location.split(',');
            if (parts.length >= 2) {
                const subAdmin = parts[parts.length - 2].trim();
                const adminArea = parts[parts.length - 1].trim();
                product.location = `${subAdmin}, ${adminArea}`; 
            } else {
                product.location = product.location.trim();
            }
        } else {
            product.location = "Chưa rõ vị trí";
        }

        const [shopCountRows] = await execute(
            `SELECT COUNT(*) as totalShopProducts FROM product WHERE ownerId = ? AND status = 'Available'`, 
            [product.ownerId]
        );
        product.shopProductCount = shopCountRows[0]?.totalShopProducts || 0;

        const [rentalRows] = await execute(
            `SELECT COUNT(*) as totalRented FROM invoicedetail WHERE productId = ?`, [id]
        );
        product.rentedCount = rentalRows[0]?.totalRented || 0;

        const [imageRows] = await execute(
            `SELECT imageUrl FROM productimage WHERE productId = ?`, [id]
        );
        product.images = imageRows.map(img => `${img.imageUrl}`);

        const [pricingRows] = await execute(
            `SELECT minDays, pricePerDay FROM producttierpricing WHERE productId = ? ORDER BY minDays ASC`, [id]
        );
        product.tierPricings = pricingRows;

        const [attrRows] = await execute(`
            SELECT a.attributeName, pav.value 
            FROM productattributevalue pav
            JOIN attribute a ON pav.attributeId = a.id
            WHERE pav.productId = ?`, [id]);

        product.specifications = attrRows.reduce((obj, item) => {
            if (obj[item.attributeName]) {
                if (!Array.isArray(obj[item.attributeName])) {
                    obj[item.attributeName] = [obj[item.attributeName]];
                }
                obj[item.attributeName].push(item.value);
            } else {
                obj[item.attributeName] = item.value;
            }
            return obj;
        }, {});

        const [policyRows] = await execute(
            `SELECT policyType, fineValue, unit, light_damage, medium_damage, heavy_damage 
            FROM policy 
            WHERE productId = ?`, 
            [id]
        );
        product.policies = policyRows;

        const [reviewRows] = await execute(`
            SELECT 
                r.id, r.invoiceDetailId, r.userId, r.productId, r.rating, r.comment, r.createdAt,
                u.name as userName, 
                u.avatar as userAvatar,
                GROUP_CONCAT(ri.imageUrl) as images 
            FROM review r
            JOIN user u ON r.userId = u.id
            LEFT JOIN reviewimage ri ON r.id = ri.reviewId 
            WHERE r.productId = ?
            GROUP BY r.id 
            ORDER BY r.createdAt DESC`, [id]);

            product.reviews = reviewRows.map(row => {
                return {
                    ...row,
                    images: row.images ? row.images.split(',').map(img => img.startsWith('http') ? img : `${img}`) : [],
                    userAvatar: row.userAvatar 
                };
            });
        
        return product;
    } catch (error) {
        throw new Error('Lỗi lấy chi tiết sản phẩm: ' + error.message);
    }
}

    
    static async getFieldsByCategoryId(categoryId) {
        try {
            const query = `
                SELECT a.id, a.attributeName 
                FROM attribute a
                JOIN categoryattribute ca ON a.id = ca.attributeId
                WHERE ca.categoryId = ?
            `;
            
            const result = await execute(query, [categoryId]);
            
            if (result && Array.isArray(result[0])) {
                return result[0]; 
            }
            
            return [];
        } catch (error) {
            console.error(`ỗi hệ thống tại hàm getFieldsByCategoryId (ID = ${categoryId}):`, error.message);
            return []; 
        }
    }

  
    static async create(ownerId, data) {
        const { basicInfo, details, pricing, shipping, policies } = data;
        console.log("Dữ liệu chính sách nhận được:", policies);
        if (!basicInfo || !basicInfo.title) throw new Error('Tiêu đề sản phẩm bắt buộc phải có!');
        if (!basicInfo.categoryId) throw new Error('Vui lòng chọn danh mục cho sản phẩm!');
        if (!shipping || !shipping.addressId) throw new Error('Địa chỉ kho bãi lưu trữ không được để trống!');
        if (!pricing || pricing.depositAmount < 0) throw new Error('Số tiền đặt cọc không hợp lệ!');

    
        if (!pricing.tierPricings || pricing.tierPricings.length === 0) {
            throw new Error('Vui lòng thiết lập ít nhất một mốc giá thuê theo ngày!');
        }
        for (const tier of pricing.tierPricings) {
            if (tier.minDays <= 0) throw new Error('Số ngày thuê tối thiểu trong bảng giá bậc thang phải lớn hơn 0!');
            if (tier.pricePerDay <= 0) throw new Error('Giá thuê mỗi ngày phải lớn hơn 0đ!');
        }

        const connection = await beginTransaction();
        
        try {
            const productQuery = `
                INSERT INTO product (ownerId, categoryId, addressId, title, description, depositAmount, quantity, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
            `;
            const [productResult] = await connection.execute(productQuery, [
                ownerId, 
                basicInfo.categoryId, 
                shipping.addressId,    
                basicInfo.title,        
                basicInfo.description || '', 
                pricing.depositAmount, 
                pricing.quantity || 1
            ]);
            const productId = productResult.insertId;

            if (basicInfo.images && basicInfo.images.length > 0) {
                
                for (const url of basicInfo.images) {
                    await connection.execute(
                        `INSERT INTO productimage (productId, imageUrl) VALUES (?, ?)`,
                        [productId, url]
                    );
                }
            }

            for (const tier of pricing.tierPricings) {
                await connection.execute(
                    `INSERT INTO producttierpricing (productId, minDays, pricePerDay) VALUES (?, ?, ?)`,
                    [productId, tier.minDays, tier.pricePerDay]
                );
            }

            if (details && details.length > 0) {
                for (const attr of details) {
                    if (attr.value === null || attr.value === undefined || String(attr.value).trim() === '') {
                        continue; 
                    }
                    await connection.execute(
                        `INSERT INTO productattributevalue (productId, attributeId, value) VALUES (?, ?, ?)`,
                        [productId, attr.id, attr.value]
                    );
                }
            }
            
            if (basicInfo.features && Array.isArray(basicInfo.features) && basicInfo.features.length > 0) {
                for (const featureItem of basicInfo.features) {
                    if (!featureItem || String(featureItem).trim() === '') continue;
                    await connection.execute(
                        `INSERT INTO productattributevalue (productId, attributeId, value) VALUES (?, ?, ?)`,
                        [
                            productId, 
                            27, 
                            String(featureItem).trim()
                        ]
                    );
                }
            }



            if (policies && policies.length > 0) {
                for (const p of policies) {
                    await connection.execute(
                        `INSERT INTO policy (productId, policyType, fineValue, unit, light_damage, medium_damage, heavy_damage) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            productId, 
                            p.type,      
                            p.fineValue, 
                            p.unit,
                            p.lightDamage || null, 
                            p.mediumDamage || null, 
                            p.heavyDamage || null
                        ]
                    );
                }
            }

            await commitTransaction(connection);
            return productId;

        } catch (error) {
            await rollbackTransaction(connection);
            throw new Error('Lỗi hệ thống khi lưu sản phẩm: ' + error.message);
        } 
    }


    static async getAllFiltered(filters) {

        let query = `
            SELECT
                p.id,
                p.ownerId,
                p.categoryId,
                p.addressId,
                p.title,
                p.description,
                p.depositAmount,
                p.quantity,
                p.status,
                p.createdAt,

                price.minPrice,

                img.thumbnail,

                sa.fullAddress AS location,

                COALESCE(ROUND(AVG(r.rating),1),5.0) AS rating,
                COUNT(DISTINCT r.id) AS reviewCount

            FROM product p

            LEFT JOIN shippingaddress sa
                ON sa.id = p.addressId

            LEFT JOIN review r
                ON r.productId = p.id

            LEFT JOIN (
                SELECT
                    productId,
                    MIN(pricePerDay) AS minPrice
                FROM producttierpricing
                GROUP BY productId
            ) price
                ON price.productId = p.id

            LEFT JOIN (
                SELECT
                    productId,
                    MIN(imageUrl) AS thumbnail
                FROM productimage
                GROUP BY productId
            ) img
                ON img.productId = p.id
        `;

        const params = [];

        const whereConditions = [
            "p.status = 'Available'"
        ];

        // Keyword
        if (filters.keyword?.trim()) {
            whereConditions.push("p.title LIKE ?");
            params.push(`%${filters.keyword}%`);
        }

        // Category
        if (filters.categoryId != null && filters.categoryId > 0) {
            whereConditions.push(`
                (
                    p.categoryId = ?
                    OR p.categoryId IN (
                        SELECT id
                        FROM category
                        WHERE parentId = ?
                    )
                )
            `);

            params.push(filters.categoryId);
            params.push(filters.categoryId);
        }

        // Location
        if (
            filters.location &&
            filters.location.trim() !== "" &&
            filters.location !== "Tất cả"
        ) {

            if (filters.location.includes("TP. Hồ Chí Minh")) {

                whereConditions.push(`
                    (
                        sa.fullAddress LIKE ?
                        OR sa.fullAddress LIKE ?
                    )
                `);

                params.push("%TP. Hồ Chí Minh%");
                params.push("%TP. HCM%");
            } else {

                whereConditions.push("sa.fullAddress LIKE ?");
                params.push(`%${filters.location}%`);
            }
        }

        query += `
            WHERE ${whereConditions.join(" AND ")}
        `;

        query += `
            GROUP BY p.id
        `;

        // HAVING
        const havingConditions = [];

        if (filters.priceMin != null) {
            havingConditions.push("price.minPrice >= ?");
            params.push(filters.priceMin);
        }

        if (filters.priceMax != null) {
            havingConditions.push("price.minPrice <= ?");
            params.push(filters.priceMax);
        }

        if (havingConditions.length > 0) {
            query += `
                HAVING ${havingConditions.join(" AND ")}
            `;
        }

        switch (filters.sortBy) {

            case "price_asc":
                query += ` ORDER BY price.minPrice ASC`;
                break;

            case "price_desc":
                query += ` ORDER BY price.minPrice DESC`;
                break;

            case "newest":
                query += ` ORDER BY p.createdAt DESC`;
                break;

            default:
                query += ` ORDER BY p.id DESC`;
                break;
        }

        // console.log("SQL:", query);
        // console.log("Params:", params);

        const [rows] = await execute(query, params);

        return rows.map(row => {

            let formattedLocation = "TP. Hồ Chí Minh";

            if (row.location) {

                const parts = row.location.split(",");

                formattedLocation =
                    parts.length >= 2
                        ? parts[parts.length - 2].trim()
                        : row.location;
            }

            return {
                ...row,
                location: formattedLocation,
                thumbnail: row.thumbnail
            };
        });
    }


    static async findByOwnerId(ownerId) {
        const query = `
            SELECT p.*, c.categoryName 
                FROM product p
                LEFT JOIN category c ON p.categoryId = c.id
                WHERE p.ownerId = ? LIMIT 0, 25;
        `;
        const [rows] = await execute(query, [ownerId]);
        return rows;
    }


    static async getByShopId(shopId) {
        try {
            const query = `
                SELECT 
                    u.name as shopName,
                    u.avatar as shopAvatar,
                    (SELECT COUNT(DISTINCT r.id) 
                    FROM rentalrequest r 
                    JOIN rentalrequestdetail rd ON r.id = rd.rentalRequestId 
                    JOIN product p2 ON rd.productId = p2.id 
                    WHERE p2.ownerId = u.id AND r.status = 'Completed') as totalRentals,
                    COALESCE((SELECT ROUND(AVG(rev.rating), 1) FROM review rev JOIN product p2 ON rev.productId = p2.id WHERE p2.ownerId = u.id), 5.0) as shopRating,
                    p.id, p.ownerId, p.title, p.depositAmount,
                    (SELECT MIN(pricePerDay) FROM producttierpricing ptp WHERE ptp.productId = p.id) AS minPrice,
                    (SELECT imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as thumbnail,
                    COALESCE((SELECT ROUND(AVG(rating), 1) FROM review WHERE productId = p.id), 5.0) as rating,
                    (SELECT COUNT(*) FROM review WHERE productId = p.id) as reviewCount
                FROM product p
                JOIN user u ON p.ownerId = u.id
                WHERE p.ownerId = ? AND p.status = 'Available'
            `;

            const [rows] = await execute(query, [shopId]);
            
            if (rows.length === 0) return { shopInfo: null, products: [] };

            const shopInfo = {
                shopName: rows[0].shopName,
                shopAvatar: rows[0].shopAvatar,
                shopRating: rows[0].shopRating,
                totalRentals: rows[0].totalRentals
            };

            const products = rows.map(row => ({
                id: row.id,
                title: row.title,
                thumbnail: row.thumbnail ,
                minPrice: row.minPrice,
                rating: row.rating,
                reviewCount: row.reviewCount
            }));

            return { shopInfo, products };
        } catch (error) {
            throw new Error('Lấy thông tin shop và sản phẩm thất bại: ' + error.message);
        }
    }

    static async getProductsByOwner(ownerId) {
        const query = `
            SELECT 
                p.id, 
                p.title, 
                p.status,
                p.quantity,
                p.depositAmount,
                (SELECT imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as thumbnail
            FROM product p
            WHERE p.ownerId = ? 
            AND p.status IN ('Available', 'Hidden')
            ORDER BY p.id DESC
        `;
        
        const [rows] = await execute(query, [ownerId]);
        return rows.map(row => ({
            id: row.id,
            title: row.title,
            status: row.status, 
            quantity: row.quantity,
            depositAmount: row.depositAmount,
            thumbnail: row.thumbnail 
        }));
    }

    static async updateProductStatus(productId, ownerId, newStatus) {
        const getProductQuery = `SELECT status, admin_lock FROM product WHERE id = ? AND ownerId = ?`;
        const [rows] = await execute(getProductQuery, [productId, ownerId]);

        if (rows.length === 0) {
            throw new Error("Không tìm thấy sản phẩm hoặc bạn không có quyền sửa!");
        }

        if (rows[0].admin_lock == 1) {
            throw new Error("Sản phẩm đã bị Admin khóa, bạn không thể thay đổi trạng thái!");
        }

        const currentStatus = rows[0].status;
        if (currentStatus !== 'Available' && currentStatus !== 'Hidden') {
            throw new Error("Không thể thay đổi trạng thái sản phẩm đang " + currentStatus);
        }

        const updateQuery = `UPDATE product SET status = ? WHERE id = ? AND ownerId = ?`;
        await execute(updateQuery, [newStatus, productId, ownerId]);
        
        return true;
    }


    static async getProductsByStatus(status, search) {
        let query = `
            SELECT 
                p.id, 
                p.title, 
                p.createdAt as datePosted, 
                p.status,
                u.name as ownerName, 
                u.email as ownerEmail, 
                c.categoryName,
                (SELECT imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as imageUrl,
                (SELECT pricePerDay FROM producttierpricing WHERE productId = p.id AND minDays = 1 LIMIT 1) as pricePerDay
            FROM product p
            JOIN user u ON p.ownerId = u.id
            JOIN category c ON p.categoryId = c.id
            WHERE 1=1
        `;
        const params = [];
        if (status && status !== 'All' && status !== '') { 
            query += " AND p.status = ?";
            params.push(status);
        }

        if (search) {
            query += " AND (p.title LIKE ? OR u.name LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        query += " ORDER BY p.createdAt DESC";
        
        const [rows] = await execute(query, params);
        return rows;
    }

   static async updateStatus(productId, status) {
        const adminLock = (status === 'Available') ? 0 : 1;
        
        const query = "UPDATE product SET status = ?, admin_lock = ? WHERE id = ?";
        const [result] = await execute(query, [status, adminLock, productId]);
        return result.affectedRows > 0;
    }
}