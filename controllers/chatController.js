import { Server } from "socket.io";
import ChatModel from "../models/chat.js";
import cloudinary from "../config/cloudinary.js";
export default class ChatController {
  
  static setupChat(server) {
    const io = new Server(server, {
      cors: { origin: "*", methods: ["GET", "POST"] },
    });

    io.on("connection", (socket) => {
      console.log(`User kết nối: ${socket.id}`);
      
      ChatController.handleSocketEvents(io, socket);

      socket.on("disconnect", () => {
        console.log(`User ngắt kết nối: ${socket.id}`);
      });
    });
  }


  static handleSocketEvents(io, socket) {
    socket.on("join_conversation", (conversationId) => {
      if (!conversationId) return;
      socket.join(conversationId.toString());
      console.log(`Socket ${socket.id} joined room ${conversationId}`);
    });

    socket.on("get_history", async (conversationId) => {
      if (!conversationId) return;
      try {
        const messages = await ChatModel.getMessagesByConversation(conversationId);
        socket.emit("chat_history", messages);
      } catch (err) {
        console.error(err);
        socket.emit("chat_error", { message: "Không thể tải lịch sử chat" });
      }
    });

    socket.on("send_message", async (data) => {
      console.log("Dữ liệu nhận từ Client:", data);
      try {
        const { conversationId, senderId, content, messageType = 'text' } = data;
        if (!conversationId || !senderId || !content || content.trim() === "") {
          socket.emit("chat_error", { message: "Dữ liệu gửi không hợp lệ" });
          return;
        }
       const message = await ChatModel.saveMessage(conversationId, senderId, content, messageType);
        console.log("DB đã lưu thành công:", message);
        io.to(conversationId.toString()).emit("receive_message", message);
      } catch (err) {
        console.error(err);
        socket.emit("chat_error", { message: "Không thể gửi tin nhắn" });
      }
    });
  }


  static async getOrCreateConversation(req, res) {
    try {
      const { productId, ownerId } = req.body;
      const currentUserId = req.user.id; 
      console.log("Flutter gửi lên hẹ hông tựu có", currentUserId);
      console.log("Flutter gửi lên ", req.body)
      if (!productId  || !ownerId) {
        return res.status(400).json({ message: "Thiếu thông tin yêu cầu" });
      }

      const conversationId = await ChatModel.getOrCreateConversation(productId, currentUserId, ownerId);
      res.status(200).json({ conversationId });
    } catch (err) {
      console.error("Lỗi tạo phòng chat:", err);
      res.status(500).json({ message: "Lỗi hệ thống" });
    }
  }

    static async uploadChatImage(req, res) {
      try {
          if (!req.files || !req.files.image) {
              return res.status(400).json({ success: false, message: "Chưa chọn ảnh!" });
          }

          const file = req.files.image;

          const result = await new Promise((resolve, reject) => {
              cloudinary.uploader.upload_stream(
                  { folder: "chat_images" }, 
                  (error, result) => {
                      if (error) reject(error);
                      else resolve(result);
                  }
              ).end(file.data);
          });

          return res.status(200).json({ 
              success: true, 
              imageUrl: result.secure_url 
          });
          
      } catch (error) {
          console.error("Lỗi upload chi tiết:", error);
          return res.status(500).json({ success: false, message: error.message });
      }
  }

    static async getConversations(req, res) {
      try {
          const userId = req.user.id; 
          
          const conversations = await ChatModel.getConversationsByUser(userId);
          return res.status(200).json({ 
              success: true, 
              data: conversations 
          });
      } catch (error) {
          console.error("Lỗi lấy danh sách chat:", error);
          return res.status(500).json({ 
              success: false, 
              message: "Không thể tải danh sách tin nhắn" 
          });
      }
  }
}