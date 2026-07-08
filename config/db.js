import {createPool} from 'mysql2/promise';
const pool = createPool({
    host : process.env.DB_HOST,
    user : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_NAME,
    waitForConnections : true,
    queueLimit : 0,
    connectionLimit : 10

});
export async function execute(query, params) {
    return await pool.execute(query, params)
};

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