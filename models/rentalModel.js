import { BASE_URL } from '../config/constants.js';
import { beginTransaction, commitTransaction, rollbackTransaction, execute } from '../config/db.js';

export class RentalModel {
    static async createRentalOrder({
        renterId, startDate, endDate, shippingMethod, receiverName, receiverPhone, fullAddress, 
        shippingFee, rentalFee, depositFee, totalAmount, items
    }) {
        const connection = await beginTransaction();

        try {
            for (const item of items) {
                const checkOverlapQuery = `
                    SELECT r.id FROM rentalrequest r
                    JOIN rentalrequestdetail rd ON r.id = rd.rentalRequestId
                    WHERE rd.productId = ? AND r.status IN ('Approved', 'Shipping', 'Delivered')
                    AND (? <= r.endDate AND ? >= r.startDate);
                `;
                const [overlapRows] = await connection.execute(checkOverlapQuery, [item.productId, endDate, startDate]);
                if (overlapRows && overlapRows.length > 0) {
                    throw new Error(`Sản phẩm (ID: ${item.productId}) đã bị trùng lịch đặt thuê!`);
                }
            }


            const rentalQuery = `
                INSERT INTO rentalrequest (renterId, startDate, endDate, status, shippingMethod, receiverName, receiverPhone, fullAddress, rentalFee, depositFee, shippingFee, totalAmount)
                VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?);
            `;
            const [rentalResult] = await connection.execute(rentalQuery, [
                renterId, startDate, endDate, shippingMethod, receiverName, receiverPhone, fullAddress, rentalFee, depositFee, shippingFee, totalAmount
            ]);
            const rentalRequestId = rentalResult.insertId;

            const detailQuery = `INSERT INTO rentalrequestdetail (rentalRequestId, productId, quantity, status) VALUES (?, ?, ?, 'Pending');`;
            for (const item of items) {
                await connection.execute(detailQuery, [rentalRequestId, item.productId, item.quantity]);
            }

            await commitTransaction(connection);
            return { rentalRequestId };

        } catch (error) {
            await rollbackTransaction(connection);
            console.error("Luồng đặt đơn thất bại:", error.message);
            throw error;
        }
    }


    static async approveRentalRequest(rentalRequestId, rejectedItems = []) {
    const connection = await beginTransaction();

    try {
        const [rentalRows] = await connection.execute(
            `
            SELECT
                renterId,
                shippingFee,
                startDate,
                endDate
            FROM rentalrequest
            WHERE id = ?
            AND status = 'Pending'
            `,
            [rentalRequestId]
        );

        if (rentalRows.length === 0) {
            throw new Error("Đơn hàng không tồn tại hoặc đã được xử lý!");
        }

        const {
            renterId,
            shippingFee,
            startDate,
            endDate
        } = rentalRows[0];

        const start = new Date(startDate);
        const end = new Date(endDate);

        const rentalDays = Math.ceil(
            Math.abs(end - start) / (1000 * 60 * 60 * 24)
        );


        const [walletRows] = await connection.execute(
            `SELECT id,balance
             FROM wallet
             WHERE userId=?
             FOR UPDATE`,
            [renterId]
        );

        if (walletRows.length === 0) {
            throw new Error("Không tìm thấy ví khách!");
        }


        for (const item of rejectedItems) {
            await connection.execute(
                `
                UPDATE rentalrequestdetail
                SET status='Cancelled',
                    cancelReason=?
                WHERE rentalRequestId=?
                AND productId=?
                `,
                [
                    item.reason,
                    rentalRequestId,
                    item.productId
                ]
            );
        }

        await connection.execute(
            `
            UPDATE rentalrequestdetail
            SET status='Approved'
            WHERE rentalRequestId=?
            AND status<>'Cancelled'
            `,
            [rentalRequestId]
        );


        const [approvedItems] = await connection.execute(
            `
            SELECT
                rd.productId,
                rd.quantity,
                p.depositAmount,
                pt.pricePerDay
            FROM rentalrequestdetail rd
            JOIN product p
                ON rd.productId=p.id
            JOIN producttierpricing pt
                ON pt.productId=rd.productId
            WHERE rd.rentalRequestId=?
            AND rd.status='Approved'
            AND pt.minDays=(
                SELECT MAX(minDays)
                FROM producttierpricing
                WHERE productId=rd.productId
                AND minDays<=?
            )
            `,
            [
                rentalRequestId,
                rentalDays
            ]
        );



        let newRentalFee = 0;
        let newDepositFee = 0;

        for (const item of approvedItems) {

            newRentalFee +=
                Number(item.pricePerDay) *
                item.quantity *
                rentalDays;

            newDepositFee +=
                Number(item.depositAmount) *
                item.quantity;
        }

        const newTotalAmount =
            newRentalFee +
            Number(shippingFee);


        if (Number(walletRows[0].balance) < newDepositFee) {
            throw new Error("Số dư ví không đủ để thanh toán tiền cọc!");
        }

        await connection.execute(
            `
            UPDATE rentalrequest
            SET
                status='Approved',
                rentalFee=?,
                depositFee=?,
                totalAmount=?,
                approvedAt=NOW()
            WHERE id=?
            `,
            [
                newRentalFee,
                newDepositFee,
                newTotalAmount,
                rentalRequestId
            ]
        );

        await connection.execute(
            `
            UPDATE wallet
            SET balance=balance-?
            WHERE id=?
            `,
            [
                newDepositFee,
                walletRows[0].id
            ]
        );

        await connection.execute(
            `
            UPDATE wallet
            SET balance=balance+?
            WHERE id=6
            `,
            [newDepositFee]
        );


        const [invoiceResult] = await connection.execute(
            `
            INSERT INTO invoice
            (
                rentalId,
                startDateSnapshot,
                endDateSnapshot,
                rentalFee,
                depositFee,
                shippingFee,
                totalAmount,
                status
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                'Paid'
            )
            `,
            [
                rentalRequestId,
                startDate,
                endDate,
                newRentalFee,
                newDepositFee,
                shippingFee,
                newTotalAmount
            ]
        );
        const [approvedItemsToCopy] = await connection.execute(
            `SELECT rd.productId, rd.quantity, p.depositAmount, pt.pricePerDay
            FROM rentalrequestdetail rd
            JOIN product p ON rd.productId = p.id
            JOIN producttierpricing pt ON pt.productId = rd.productId
            WHERE rd.rentalRequestId = ? AND rd.status = 'Approved'
            AND pt.minDays = (SELECT MAX(minDays) FROM producttierpricing WHERE productId = rd.productId AND minDays <= ?)`,
            [rentalRequestId, rentalDays]
        );

        for (const item of approvedItemsToCopy) {
            await connection.execute(
                `INSERT INTO invoicedetail (invoiceId, productId, quantity, rentalFeeSnapshot, depositFeeSnapshot)
                VALUES (?, ?, ?, ?, ?)`,
                [
                    invoiceResult.insertId, 
                    item.productId,
                    item.quantity,
                    Number(item.pricePerDay) * rentalDays,
                    Number(item.depositAmount)
                ]
            );
        }
      

        await connection.execute(
            `
            INSERT INTO wallettransaction
            (
                walletId,
                rentalRequestId,
                invoiceId,
                transactionType,
                amount,
                status
            )
            VALUES
            (
                ?,
                ?,
                ?,
                'TransferToAdmin',
                ?,
                'Completed'
            )
            `,
            [
                walletRows[0].id,
                rentalRequestId,
                invoiceResult.insertId,
                newDepositFee
            ]
        );

        await commitTransaction(connection);

        return {
            success: true,
            message: "Duyệt đơn và thu tiền cọc thành công!"
        };

    } catch (error) {
        await rollbackTransaction(connection);
        throw error;
    }
}
   
   static async completeRentalOrder(
    rentalRequestId,
    actualReturnDate,
    compensationAmount = 0,
    complainId = null,
    totalPenaltyFee = 0
) {
    const connection = await beginTransaction();

    try {


        await connection.execute(
            `
            UPDATE rentalrequest
            SET status='Completed',
                actualReturnDate=?
            WHERE id=?;
            `,
            [actualReturnDate, rentalRequestId]
        );


  
        const [rentalRows] = await connection.execute(
            `
            SELECT
                renterId,
                rentalFee,
                depositFee,
                shippingFee
            FROM rentalrequest
            WHERE id=?;
            `,
            [rentalRequestId]
        );

        if (rentalRows.length === 0)
            throw new Error("Không tìm thấy đơn thuê.");

        const {
            renterId,
            rentalFee,
            depositFee,
            shippingFee
        } = rentalRows[0];

        const [invoiceRows] = await connection.execute(
            `
            SELECT id
            FROM invoice
            WHERE rentalId=?;
            `,
            [rentalRequestId]
        );

        if (invoiceRows.length === 0)
            throw new Error("Không tìm thấy Invoice.");

        const invoiceId = invoiceRows[0].id;


        const totalDueFromRenter =
            Number(rentalFee)
            + Number(shippingFee)
            + Number(totalPenaltyFee)
            + Number(compensationAmount);

        let refundToRenter =
            Number(depositFee) - totalDueFromRenter;

        if (refundToRenter < 0)
            refundToRenter = 0;


        await connection.execute(
            `
            UPDATE invoice
            SET
                actualReturnDateSnapshot=?,
                complainId=?,
                penaltyFee=?,
                depositRefundAmount=?,
                totalAmount=?,
                status='Completed'
            WHERE id=?;
            `,
            [
                actualReturnDate,
                complainId,
                Number(totalPenaltyFee) + Number(compensationAmount),
                refundToRenter,
                totalDueFromRenter,
                invoiceId
            ]
        );


        await connection.execute(
            `
            UPDATE wallet
            SET balance = balance - ?
            WHERE id = 6;
            `,
            [depositFee]
        );


        if (refundToRenter > 0) {

            await connection.execute(
                `
                UPDATE wallet
                SET balance = balance + ?
                WHERE userId = ?;
                `,
                [refundToRenter, renterId]
            );

            await connection.execute(
                `
                INSERT INTO wallettransaction
                (
                    walletId,
                    rentalRequestId,
                    invoiceId,
                    transactionType,
                    amount,
                    status
                )
                VALUES
                (
                    (SELECT id FROM wallet WHERE userId=?),
                    ?,
                    ?,
                    'Refund',
                    ?,
                    'Success'
                );
                `,
                [
                    renterId,
                    rentalRequestId,
                    invoiceId,
                    refundToRenter
                ]
            );
        }


        const [ownerRows] = await connection.execute(
            `
            SELECT p.ownerId
            FROM product p
            JOIN rentalrequestdetail rd
                ON rd.productId=p.id
            WHERE rd.rentalRequestId=?
            LIMIT 1;
            `,
            [rentalRequestId]
        );

        if (ownerRows.length === 0)
            throw new Error("Không tìm thấy chủ shop.");

        const ownerId = ownerRows[0].ownerId;

        const payoutAmount =
            Number(rentalFee)
            + Number(shippingFee)
            + Number(compensationAmount);

        await connection.execute(
            `
            UPDATE wallet
            SET balance = balance + ?
            WHERE userId = ?;
            `,
            [payoutAmount, ownerId]
        );

        await connection.execute(
            `
            INSERT INTO wallettransaction
            (
                walletId,
                rentalRequestId,
                invoiceId,
                transactionType,
                amount,
                status
            )
            VALUES
            (
                (SELECT id FROM wallet WHERE userId=?),
                ?,
                ?,
                'Income',
                ?,
                'Success'
            );
            `,
            [
                ownerId,
                rentalRequestId,
                invoiceId,
                payoutAmount
            ]
        );
        await commitTransaction(connection);

        return {
            success: true,
            invoiceId,
            totalDueFromRenter,
            refundToRenter
        };

    } catch (error) {

        await rollbackTransaction(connection);

        console.error(error);

        throw error;
    }
}

    static async getUnavailableDates(productIds) {
        if (!productIds || productIds.length === 0) return [];
        const placeholders = productIds.map(() => '?').join(', ');
        const query = `
            SELECT DATE_FORMAT(r.startDate, '%Y-%m-%d') as startDate, DATE_FORMAT(r.endDate, '%Y-%m-%d') as endDate
            FROM rentalrequest r JOIN rentalrequestdetail rd ON r.id = rd.rentalRequestId
            WHERE rd.productId IN (${placeholders}) AND r.status IN ('Approved', 'Shipping', 'Delivered');
        `;
        const [rows] = await execute(query, productIds);
        let bookedDates = [];
        for (const row of rows) {
            let start = new Date(row.startDate); let end = new Date(row.endDate);
            while (start <= end) { 
                bookedDates.push(start.toISOString().split('T')[0]); 
                start.setDate(start.getDate() + 1); 
            }
        }
        return [...new Set(bookedDates)];
    }

    static async getRenterOrders(renterId, status) {
        let query = `
            SELECT 
                r.id,
                r.createdAt,
                CONCAT('#RS', r.id) as orderCode,
                DATE_FORMAT(r.createdAt, '%d/%m/%Y %H:%i') as orderDate,
                DATE_FORMAT(r.startDate, '%d/%m/%Y') as startDate,
                DATE_FORMAT(r.endDate, '%d/%m/%Y') as endDate,
                DATEDIFF(r.endDate, r.startDate) as rentalDays,
                r.status, 
                r.shippingMethod,
                r.receiverName,
                r.receiverPhone,
                r.fullAddress,
                r.rentalFee,
                r.depositFee,
                r.shippingFee,
                r.totalAmount
            FROM rentalrequest r
            WHERE r.renterId = ?
        `;
        
        const params = [renterId];
        if (status) {
            query += ` AND r.status = ?`;
            params.push(status);
        }

        query += ` ORDER BY r.createdAt DESC`;

        const [orders] = await execute(query, params);

        for (let order of orders) {
            if (order.status === 'Pending') order.statusLabel = 'Chờ duyệt';
            else if (order.status === 'Approved') order.statusLabel = 'Đã duyệt';
            else if (order.status === 'Shipping') order.statusLabel = 'Đang giao';
            else if (order.status === 'Delivered') order.statusLabel = 'Đang thuê';
            else if (order.status === 'Returned') order.statusLabel = 'Chờ trả hàng';
            else if (order.status === 'Inspecting') order.statusLabel = 'Đang nghiệm thu';
            else if (order.status === 'Completed') order.statusLabel = 'Hoàn tất';
            else if (order.status === 'Cancelled') order.statusLabel = 'Đã hủy';
            else order.statusLabel = order.status;

            const [products] = await execute(`
                SELECT 
                    id_thuc_te.id as invoiceDetailId, 
                    rd.productId,
                    rd.quantity,
                    p.title,
                    (SELECT  imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as image,
                    p.depositAmount,
                    pt.pricePerDay,
                    EXISTS (
                        SELECT 1 FROM review r 
                        JOIN invoicedetail id_rev ON r.invoiceDetailId = id_rev.id
                        JOIN invoice i_rev ON id_rev.invoiceId = i_rev.id
                        WHERE i_rev.rentalId = rd.rentalRequestId 
                        AND id_rev.productId = rd.productId 
                        AND r.userId = ?
                    ) as isReviewed
                FROM rentalrequestdetail rd
                JOIN product p ON rd.productId = p.id
                LEFT JOIN invoice i ON i.rentalId = rd.rentalRequestId
                LEFT JOIN invoicedetail id_thuc_te ON id_thuc_te.invoiceId = i.id AND id_thuc_te.productId = rd.productId
                LEFT JOIN producttierpricing pt ON p.id = pt.productId AND pt.minDays = 1
                WHERE rd.rentalRequestId = ?
            `, [renterId, order.id]);
            order.items = products;
        }
        return orders;
    }

   
    static async getOrderDetails(rentalRequestId) {
        const query = `
        SELECT 
            r.id,
            r.renterId,      
            CONCAT('#RS', r.id) as orderCode,
            DATE_FORMAT(r.createdAt, '%d/%m/%Y %H:%i') as orderDate,
            DATE_FORMAT(r.startDate, '%d/%m/%Y') as startDateFormatted,
            DATE_FORMAT(r.endDate, '%d/%m/%Y') as endDateFormatted,
            DATEDIFF(r.endDate, r.startDate) as rentalDays,
            r.status,
            r.shippingMethod,
            r.receiverName,
            r.receiverPhone,
            r.fullAddress,
            r.rentalFee,
            r.depositFee,
            r.shippingFee,
            r.totalAmount,
            r.cancelReason,
            r.returnProof, 
            r.trackingNumber,
            r.note
            FROM rentalrequest r
            WHERE r.id = ?
            LIMIT 1;
        `;

        const [rows] = await execute(query, [rentalRequestId]);
        if (rows.length === 0) return null;

        const order = rows[0];
        const renterId = order.renterId;

        const [products] = await execute(`
            SELECT 
                id_thuc_te.id as invoiceDetailId, 
                rd.productId,
                rd.quantity,
                p.title,
                (SELECT  imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as image,
                p.depositAmount,
                pt.pricePerDay,
                EXISTS (
                    SELECT 1 FROM review r 
                    JOIN invoicedetail id_rev ON r.invoiceDetailId = id_rev.id
                    JOIN invoice i_rev ON id_rev.invoiceId = i_rev.id
                    WHERE i_rev.rentalId = rd.rentalRequestId 
                    AND id_rev.productId = rd.productId 
                    AND r.userId = ?
                ) as isReviewed
            FROM rentalrequestdetail rd
            JOIN product p ON rd.productId = p.id
            LEFT JOIN invoice i ON i.rentalId = rd.rentalRequestId
            LEFT JOIN invoicedetail id_thuc_te ON id_thuc_te.invoiceId = i.id AND id_thuc_te.productId = rd.productId
            LEFT JOIN producttierpricing pt ON p.id = pt.productId AND pt.minDays = 1
            WHERE rd.rentalRequestId = ? 
        `, [renterId, rentalRequestId]);
        order.items = products; 
        if (products.length > 0 && products[0].productId) { // Kiểm tra cả productId có tồn tại
            const [ownerRows] = await execute(`
                SELECT p.ownerId, u.name as ownerName, 
                   IF(u.avatar IS NOT NULL, u.avatar, NULL) as ownerAvatar
                FROM product p
                JOIN user u ON p.ownerId = u.id
                WHERE p.id = ? LIMIT 1;
            `, [products[0].productId]);

            if (ownerRows.length > 0) {
                order.ownerId = ownerRows[0].ownerId;
                order.ownerName = ownerRows[0].ownerName;
                order.ownerAvatar = ownerRows[0].ownerAvatar;
            } else {
                order.ownerName = "Chưa xác định"; 
            }
        } else {
            order.ownerName = "Chưa xác định";
        }

        return order;
    }

    static async cancelRentalRequestByUser(rentalRequestId, reason = "Người dùng tự hủy đơn") {
        const connection = await beginTransaction();

        try {
            const [orderRows] = await connection.execute(
                `SELECT status FROM rentalrequest WHERE id = ? FOR UPDATE;`,
                [rentalRequestId]
            );
            
            if (!orderRows || orderRows.length === 0) {
                throw new Error("Không tìm thấy thông tin đơn thuê yêu cầu này");
            }
            if (orderRows[0].status !== 'Pending') {
                throw new Error("Đơn hàng đã được xử lý (Duyệt/Giao/Hủy), bạn không thể tự hủy lúc này!");
            }

            await connection.execute(
                `UPDATE rentalrequest SET status = 'Cancelled', cancelReason = ? WHERE id = ?;`,
                [reason, rentalRequestId]
            );
            await connection.execute(
                `UPDATE rentalrequestdetail SET status = 'Cancelled' WHERE rentalRequestId = ?;`,
                [rentalRequestId]
            );

            const [txRows] = await connection.execute(
                `SELECT walletId, amount FROM wallettransaction 
                 WHERE rentalRequestId = ? AND transactionType = 'Hold' AND status = 'Pending' FOR UPDATE;`,
                [rentalRequestId]
            );

            if (txRows && txRows.length > 0) {
                const walletId = txRows[0].walletId;
                const refundAmount = Number(txRows[0].amount);

                const [walletResult] = await connection.execute(
                    `UPDATE wallet SET balance = balance + ?, frozenAmount = frozenAmount - ? WHERE id = ?;`,
                    [refundAmount, refundAmount, walletId]
                );

                if (walletResult.affectedRows === 0) {
                    throw new Error("Không tìm thấy thông tin ví điện tử liên kết để hoàn tiền!");
                }

                await connection.execute(
                    `UPDATE wallettransaction 
                     SET status = 'Cancelled' 
                     WHERE rentalRequestId = ? AND transactionType = 'Hold' AND status = 'Pending';`,
                    [rentalRequestId]
                );

                const insertRefundQuery = `
                    INSERT INTO wallettransaction (walletId, rentalRequestId, invoiceId, transactionType, amount, status) 
                    VALUES (?, ?, NULL, 'Refund', ?, 'Success');
                `;
                await connection.execute(insertRefundQuery, [walletId, rentalRequestId, refundAmount]);
            }

            await commitTransaction(connection);
            return { success: true, message: "Hủy đơn thuê thành công, tiền cọc đã được hoàn trả 100% về ví" };

        } catch (error) {
            await rollbackTransaction(connection);
            console.error("Luồng hủy đơn thất bại:", error.message);
            throw error;
        }
    }

    static async getOwnerPendingStats(ownerId) {
        const query = `
            SELECT 
                COUNT(DISTINCT r.id) as totalPendingOrders,
                IFNULL(SUM(r.totalAmount), 0) as totalPendingValue
            FROM rentalrequest r
            JOIN rentalrequestdetail rd ON r.id = rd.rentalRequestId
            JOIN product p ON rd.productId = p.id
            WHERE p.ownerId = ? AND r.status = 'Pending';
        `;
        const [rows] = await execute(query, [ownerId]);
        return rows[0];
    }


    static async rejectRentalRequest(rentalRequestId, cancelReason = "Chủ shop từ chối duyệt đơn") {
        const connection = await beginTransaction();
        try {
            const [result] = await connection.execute(
                `UPDATE rentalrequest SET status = 'Cancelled', cancelReason = ? WHERE id = ? AND status = 'Pending';`,
                [cancelReason, rentalRequestId]
            );

            if (result.affectedRows === 0) {
                throw new Error("Không thể hủy đơn hàng này!");
            }

  
            await connection.execute(
                `UPDATE rentalrequestdetail SET status = 'Cancelled' WHERE rentalRequestId = ?;`, 
                [rentalRequestId]
            );


            await commitTransaction(connection);
            return { success: true, message: "Đã hủy đơn hàng thành công!" };
        } catch (error) {
            await rollbackTransaction(connection);
            console.error("Lỗi khi hủy đơn:", error.message);
            throw error;
        }
    }

    static async getOwnerOrders(ownerId, status) {
        let query = `
            SELECT DISTINCT
                r.id,
                r.createdAt,
                CONCAT('#RS', r.id) as orderCode,
                DATE_FORMAT(r.createdAt, '%d/%m/%Y %H:%i') as orderDate,
                DATE_FORMAT(r.startDate, '%d/%m/%Y') as startDateFormatted,
                DATE_FORMAT(r.endDate, '%d/%m/%Y') as endDateFormatted,
                DATEDIFF(r.endDate, r.startDate) as rentalDays,
                r.status, 
                r.shippingMethod,
                r.receiverName,
                r.receiverPhone,
                r.fullAddress,
                r.rentalFee,
                r.depositFee,
                r.shippingFee,
                r.totalAmount,
                u_renter.name as renterName
            FROM rentalrequest r
            JOIN rentalrequestdetail rd ON r.id = rd.rentalRequestId
            JOIN product p ON rd.productId = p.id
            JOIN user u_renter ON r.renterId = u_renter.id
            WHERE p.ownerId = ?
        `;
        
        const params = [ownerId];
        if (status) {
            query += ` AND r.status = ?`;
            params.push(status);
        }

        query += ` ORDER BY r.createdAt DESC`;

        const [orders] = await execute(query, params);

        for (let order of orders) {
            if (order.status === 'Pending') order.statusLabel = 'Chờ duyệt';
            else if (order.status === 'Approved') order.statusLabel = 'Đã duyệt';
            else if (order.status === 'Shipping') order.statusLabel = 'Đang giao';
            else if (order.status === 'Delivered') order.statusLabel = 'Đang thuê';
            else if (order.status === 'Returned') order.statusLabel = 'Chờ nhận lại';
            else if (order.status === 'Inspecting') order.statusLabel = 'Đang nghiệm thu';
            else if (order.status === 'Completed') order.statusLabel = 'Hoàn tất';
            else if (order.status === 'Cancelled') order.statusLabel = 'Đã hủy';
            else order.statusLabel = order.status;

            const [products] = await execute(`
                SELECT 
                    rd.productId,
                    rd.quantity,
                    p.title,
                    (SELECT  imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as image,
                    p.depositAmount,
                    pt.pricePerDay 
                FROM rentalrequestdetail rd
                JOIN product p ON rd.productId = p.id
                LEFT JOIN producttierpricing pt ON p.id = pt.productId AND pt.minDays = 1
                WHERE rd.rentalRequestId = ? AND rd.status != 'Cancelled'
            `, [order.id]);

            order.items = products;
        }
        return orders;
    }

    static async getOwnerStatsByStatus(ownerId, status) {
        const query = `
            SELECT 
                COUNT(DISTINCT r.id) as totalOrders,
                IFNULL(SUM(r.totalAmount), 0) as totalValue
            FROM rentalrequest r
            JOIN rentalrequestdetail rd ON r.id = rd.rentalRequestId
            JOIN product p ON rd.productId = p.id
            WHERE p.ownerId = ? AND r.status = ?;
        `;
        const [rows] = await execute(query, [ownerId, status || 'Pending']);
        return rows[0];
    }

   
    static async renterReturnOrder(rentalRequestId, returnProof, trackingNumber, note) {
        const query = `
            UPDATE rentalrequest 
            SET status = 'Returned', 
                returnProof = ?, 
                trackingNumber = ?, 
                note = ?, 
                returnedAt = NOW() 
            WHERE id = ? AND status = 'Delivered';
        `;
        const [result] = await execute(query, [returnProof, trackingNumber, note, rentalRequestId]);
        
        return result.affectedRows > 0;
    }


    static async reportDamage(rentalRequestId, note, compensation, proofUrl) {
        const connection = await beginTransaction();
        try {
            await connection.execute(`
                UPDATE rentalrequest SET status = 'Inspecting' WHERE id = ?`, 
                [rentalRequestId]);
            
            await connection.execute(`
                INSERT INTO complain (rentalId, complainBy, title, reason, ownerNote, evidence, compensationAmount, status)
                VALUES (?, 'Owner', 'Báo cáo hàng hư hỏng', ?, ?, ?, ?, 'Pending')`, 
                [rentalRequestId, note, note, proofUrl, compensation]);

            await commitTransaction(connection);
            return true;
        } catch (error) {
            await rollbackTransaction(connection);
            throw error;
        }
    }

    static async getPoliciesByProductId(productId) {
        const [rows] = await execute(`
            SELECT 
                policyType, 
                content, 
                fineValue, 
                unit,
                light_damage, 
                medium_damage, 
                heavy_damage 
            FROM policy 
            WHERE productId = ?`, 
            [productId]
        );
        return rows;
    }

    static async getDamageReportByRentalId(rentalRequestId) {
        const [rows] = await execute(`
            SELECT * FROM complain WHERE rentalId = ? AND complainBy = 'Owner'
        `, [rentalRequestId]);
        return rows[0]; 
    }

    static async acceptDamageReport(rentalRequestId) {
        const connection = await beginTransaction();
        try {
            const [reportRows] = await connection.execute(
                `SELECT compensationAmount FROM complain WHERE rentalId = ? AND complainBy = 'Owner' AND status = 'Pending' LIMIT 1;`,
                [rentalRequestId]
            );

            if (reportRows.length === 0) throw new Error("Không tìm thấy báo cáo nào đang chờ xử lý!");
            const compensationAmount = reportRows[0].compensationAmount;

            await connection.execute(
                `UPDATE complain SET status = 'Resolved' WHERE rentalId = ? AND complainBy = 'Owner';`,
                [rentalRequestId]
            );

            await this.completeRentalOrder(rentalRequestId, new Date(), compensationAmount, null);

            await commitTransaction(connection);
            return { success: true, message: "Khách hàng đã đồng ý với báo cáo, đơn hàng đã hoàn tất!" };

        } catch (error) {
            await rollbackTransaction(connection);
            console.error("Lỗi khi khách hàng đồng ý báo cáo:", error.message);
            throw error;
        }
    }
}