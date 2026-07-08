import { execute } from "../config/db.js";

export default class ChatModel {

  static async saveMessage(conversationId, senderId, content, messageType = 'text') {
    const [result] = await execute(
      `INSERT INTO message (conversation_id, sender_id, content, messageType) VALUES (?, ?, ?, ?)`,
      [conversationId, senderId, content, messageType]
    );

    const [rows] = await execute(
      `SELECT id, conversation_id, sender_id, content, messageType, createdAt 
       FROM message WHERE id = ?`,
      [result.insertId]
    );

    return rows[0];
  }

  // static async getMessagesByConversation(conversationId) {

  //   const [rows] = await execute(
  //     `SELECT
  //         id,
  //         conversation_id,
  //         sender_id,
  //         content,
  //         messageType,
  //         createdAt
  //     FROM message
  //     WHERE conversation_id = ?
  //     ORDER BY createdAt ASC`,
  //     [conversationId]
  //   );

  //   return rows;
  // }
    static async getMessagesByConversation(conversationId) {
      const [rows] = await execute(
        `SELECT 
            m.id, 
            m.conversation_id, 
            m.sender_id, 
            m.content, 
            m.messageType, 
            m.createdAt,
            u.avatar as sender_avatar,
            u.name as sender_name
        FROM message m
        JOIN user u ON m.sender_id = u.id 
        WHERE m.conversation_id = ?
        ORDER BY m.createdAt ASC`,
        [conversationId]
      );

      return rows;
  }

  static async getOrCreateConversation(productId, userId, ownerId) {
    const [existing] = await execute(
      `SELECT id FROM conversation 
      WHERE product_id = ? AND ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))`,
      [productId, userId, ownerId, ownerId, userId] 
    );

    if (existing.length > 0) return existing[0].id;

    const [result] = await execute(
      `INSERT INTO conversation (product_id, user1_id, user2_id) VALUES (?, ?, ?)`,
      [productId, userId, ownerId]
    );
    
    return result.insertId;
  }

  static async getConversationsByUser(userId) {
    const [rows] = await execute(
      `SELECT c.id, c.product_id, c.user1_id, c.user2_id, 
              p.title as productName, 
              (SELECT imageUrl FROM productimage WHERE productId = p.id LIMIT 1) as productImage,
              u1.name as user1Name, 
              u2.name as user2Name,
              (SELECT content FROM message WHERE conversation_id = c.id ORDER BY createdAt DESC LIMIT 1) as lastMessage
      FROM conversation c
      JOIN product p ON c.product_id = p.id
      JOIN user u1 ON c.user1_id = u1.id
      JOIN user u2 ON c.user2_id = u2.id
      WHERE c.user1_id = ? OR c.user2_id = ?
      ORDER BY (SELECT createdAt FROM message WHERE conversation_id = c.id ORDER BY createdAt DESC LIMIT 1) DESC`,
      [userId, userId]
    );
    return rows;
}

}