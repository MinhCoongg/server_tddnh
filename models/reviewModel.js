import { execute, beginTransaction, commitTransaction, rollbackTransaction } from '../config/db.js';
export default class ReviewModel {

    static async getReviewsByProduct(productId) {
        const [reviews] = await execute(
            `
            SELECT
                r.id,
                r.rating,
                r.comment,
                r.createdAt,
                u.name,
                u.avatar
            FROM review r
            JOIN user u
            ON r.userId=u.id
            WHERE r.productId=?
            ORDER BY r.createdAt DESC
            `,
            [productId]
        );

        for (const review of reviews) {
            const [images] = await execute(
                `
                SELECT imageUrl
                FROM reviewimage
                WHERE reviewId=?
                `,
                [review.id]
            );

            review.images =
                images.map(e => e.imageUrl);
        }

        return reviews;

    }


    static async checkEligibility(userId, invoiceDetailId, productId) {

    console.log("==============");
    console.log({
        userId,
        invoiceDetailId,
        productId
    });

    const [rows] = await execute(
        `
        SELECT 1
        FROM invoicedetail d
        JOIN invoice i ON d.invoiceId=i.id
        JOIN rentalrequest rr ON i.rentalId=rr.id
        WHERE
            d.id=?
            AND d.productId=?
            AND rr.renterId=?
            AND i.status='Completed'
            AND NOT EXISTS(
                SELECT 1
                FROM review r
                WHERE r.invoiceDetailId=d.id
            )
        `,
        [
            invoiceDetailId,
            productId,
            userId
        ]
    );

    console.log(rows);

    return rows.length > 0;
}


    static async addReview({ invoiceDetailId, userId, productId, rating, comment, images }) {
        const connection = await  beginTransaction();
        try {
            const [result] = await connection.execute(
                `INSERT INTO review(invoiceDetailId, userId, productId, rating, comment) VALUES(?,?,?,?,?)`, 
                [invoiceDetailId, userId, productId, rating, comment]
            );
            const reviewId = result.insertId;

           console.log("Danh sách ảnh nhận được trong Model:", images); 

            if (images && Array.isArray(images) && images.length > 0) {
                for (const imageUrl of images) {
                    await connection.execute(`INSERT INTO reviewimage(reviewId, imageUrl) VALUES(?,?)`, [reviewId, imageUrl]);
                }
            } else {
                console.log("Không có ảnh nào để insert vào bảng reviewimage");
            }

            await connection.commit(); 
            return reviewId;
        } catch (error) {
            await connection.rollback(); 
            throw error;
        } finally {
            connection.release();
        }
    }

}
