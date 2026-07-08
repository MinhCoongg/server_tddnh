import cron from 'node-cron';
import { execute } from '../config/db.js';

cron.schedule("*/10 * * * * *", async () => {
    try {
        const [result] = await execute(`
            UPDATE rentalrequest
            SET status = CASE
                WHEN status='Approved'
                     AND TIMESTAMPDIFF(SECOND, approvedAt, NOW()) >= 5
                THEN 'Shipping'

                WHEN status='Shipping'
                     AND TIMESTAMPDIFF(SECOND, approvedAt, NOW()) >= 10
                THEN 'Delivered'

                ELSE status
            END
            WHERE approvedAt IS NOT NULL
            AND (
                (status='Approved' AND TIMESTAMPDIFF(SECOND, approvedAt, NOW()) >= 5)
                OR
                (status='Shipping' AND TIMESTAMPDIFF(SECOND, approvedAt, NOW()) >= 10)
            );
        `);

        console.log(`Cron cập nhật ${result.affectedRows} đơn hàng`);

    } catch (err) {
        console.error("Cron Error:", err);
    }
});