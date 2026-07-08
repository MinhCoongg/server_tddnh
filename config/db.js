import {createPool} from 'mysql2/promise';
const pool = createPool({
    host: process.env.MYSQLHOST || process.env.DB_HOST,
    user: process.env.MYSQLUSER || process.env.DB_USER,
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
    database: process.env.MYSQLDATABASE || process.env.DB_NAME,
    port: process.env.MYSQLHOST === 'mysql.railway.internal' ? 3306 : (process.env.MYSQLPORT || 45431),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true, 
    keepAliveInitialDelay: 10000
});
export async function execute(query, params) {
    try {
        return await pool.execute(query, params);
    } catch (error) {
        console.error("Lỗi Database Connection:", error.message);
        throw error; 
    }
}

export async function beginTransaction() {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    return connection;
};

export async function commitTransaction(connection) {
    await connection.commit();
    connection.release();
};
export async function rollbackTransaction(connection) {
   await connection.rollback();
   connection.release();
}
//eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywiaWF0IjoxNzYxODcwODQ5LCJleHAiOjE3NjE4OTk2NDl9.tNZZ9OdF4-UlOZ_GQU94jGGS2X-He394_F0eK8nGfjY