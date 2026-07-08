import userModel from '../models/userModel.js';
import { compare, hash } from "bcrypt";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { BASE_URL } from '../config/constants.js';
import fs from "fs";
import path from "path";
import cloudinary from '../config/cloudinary.js';

const JWT_SECRET = process.env.JWT_SECRET;
const PASSWORD_HASH_ROUND = parseInt(process.env.PASSWORD_HASH_ROUND) || 10;

export default class userController {


    static async login(req, res) {
        try {
            const { email, password } = req.body;
            const userBasic = await userModel.findByEmail(email);
            if (!userBasic) {
                return res.status(401).json({ succeeded: false, message: "Email hoặc mật khẩu không chính xác!" });
            }

            const isMatch = await bcrypt.compare(password, userBasic.password);
            if (!isMatch) {
                return res.status(401).json({ succeeded: false, message: "Email hoặc mật khẩu không chính xác!" });
            }

            if (userBasic.status === 'Blocked') {
                return res.status(403).json({ 
                    succeeded: false, 
                    message: "Tài khoản của bạn đã bị khóa bởi quản trị viên. Vui lòng liên hệ hỗ trợ!" 
                });
            }

            
            const fullUserData = await userModel.getUserSessionData(userBasic.id);
            const token = jwt.sign(
                { 
                    id: fullUserData.id, 
                    role: fullUserData.role 
                }, 
                JWT_SECRET, 
                { expiresIn: '7d' } 
            );

            res.status(200).json({
                succeeded: true,
                message: "Đăng nhập thành công!",
                token: token,
                user: {
                    id: fullUserData.id,
                    name: fullUserData.name,
                    email: fullUserData.email,
                    role: fullUserData.role,        
                    avatar: fullUserData.avatar,
                   
                    address: fullUserData.diaChi ?? '',       
                    phoneNumber: fullUserData.phoneNumber,    
                    isVerified: true,                
                    wallet: {
                        balance: fullUserData.balance,
                        frozenAmount: fullUserData.frozenAmount
                    }
                }
            });

        } catch (error) {
            res.status(500).json({ succeeded: false, message: "Lỗi Server: " + error.message });
        }
    }

    static async validatePassword(password) {
        const passwordRule = {
            minLength: 8,
            maxLength: 100,
            requiredUpperCase: true,
            requiredLowerCase: true,
            requiredNumber: true,
            requiredSpecial: true
        };
        if (password.length < passwordRule.minLength || password.length > passwordRule.maxLength) return false;
        if (passwordRule.requiredUpperCase && !/[A-Z]/.test(password)) return false;
        if (passwordRule.requiredLowerCase && !/[a-z]/.test(password)) return false;
        if (passwordRule.requiredNumber && !/[0-9]/.test(password)) return false;
        if (passwordRule.requiredSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
        return true;
    }

    static async register(req, res) {
        try {
            const { name, email, password, phoneNumber } = req.body;

            if (!name || !email || !password || !phoneNumber) {
                return res.status(400).json({ 
                    succeeded: false, 
                    message: "Vui lòng nhập đầy đủ Họ tên, Email, Số điện thoại và Mật khẩu!" 
                });
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    succeeded: false,
                    message: 'Định dạng Email không hợp lệ!'
                });
            }

            const phoneRegex = /^[0-9]{10,11}$/;
            if (!phoneRegex.test(phoneNumber)) {
                return res.status(400).json({
                    succeeded: false,
                    message: 'Số điện thoại không hợp lệ! Vui lòng nhập từ 10 đến 11 chữ số.'
                });
            }
            
            if (!await userController.validatePassword(password)) {
                return res.status(400).json({
                    succeeded: false,
                    message: 'Mật khẩu quá yếu! Yêu cầu từ 8-100 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.'
                });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const newUserId = await userModel.create({
                name,
                email,
                password: hashedPassword,
                phoneNumber: phoneNumber,
                roleId: 2 
            });

            if (newUserId) {
                return res.status(201).json({
                    succeeded: true,
                    message: "Đăng ký tài khoản thành công! Hệ thống đã tự động kích hoạt Ví điện tử ảo cho bạn.",
                    data: { userId: newUserId }
                });
            }

            return res.status(500).json({
                succeeded: false,
                message: 'Hệ thống không thể khởi tạo tài khoản! Vui lòng thử lại sau.'
            });

        } catch (error) {
            return res.status(error.message.includes('đã được sử dụng') ? 400 : 500).json({ 
                succeeded: false, 
                message: error.message 
            });
        }
    }


    // static async uploadAvatar(req, res){
    //     try{
    //         console.log("Đã nhận được request upload avatar");
    //         if (!req.files || !req.files.avatar) {
    //             console.log("Lỗi: Không tìm thấy req.files.avatar");
    //             return res.status(400).json(
    //                 { success: false, message: 'Không tìm thấy file gửi lên' });
    //         }
    //         const id = req.user.id; 
    //         const currentUser = await userModel.findById(id);
    //         const oldAvatar = currentUser ? currentUser.avatar : null;

    //         const avatarFile = req.files.avatar;
    //         const fileName = `${Date.now()}-${avatarFile.name}`;
    //        const uploadPath = path.join(process.cwd(), 'uploads', fileName);
    //         console.log("Đường dẫn lưu file:", uploadPath);
    //         avatarFile.mv(uploadPath, async (err) => {
    //       if (err){
    //         console.log("Lưu file vật lý thành công. Đang cập nhật Database...");
    //         return res.status(500).json({ success: false, message: err.message });
    //       } 
    //       console.log("Lưu file vật lý thành công. Đang cập nhật Database...");
    //       console.log("Đang update cho User ID:", id);
    //       const isUpdated = await userModel.updateAvatar(id, "/uploads/"+fileName,);

    //       if (isUpdated) {
    //         if(oldAvatar && oldAvatar !== '/uploads/rentshare.jpg'){
    //             const oldPath = path.join(process.cwd(), 'uploads', oldAvatar);
    //             if (fs.existsSync(oldPath)) {
    //                     fs.unlink(oldPath, (err) => {
    //                         if (err) console.error("Lỗi khi xóa ảnh cũ:", err);
    //                         else console.log("Đã xóa ảnh cũ thành công:", oldAvatar);
    //                     });
    //                 }
    //         }
    //         return res.status(200).json({
    //           success: true,
    //           message: "Cập nhật ảnh thành công",
    //           user: {
    //             avatar: `/uploads/${fileName}`
    //           }
    //         });
    //       }
    //       console.log("Thất bại: userModel.updateAvatar không thành công");
    //       res.status(400).json({ success: false, message: "Cập nhật DB thất bại" });
    //         });
    //     }catch (error) {
    //         console.error("Lỗi Catch trong controller:", error);
    //         res.status(500).json({ success: false, message: error.message });
    //     }
            
    // }
    static async uploadAvatar(req, res) {
        try {
            if (!req.files || !req.files.avatar) {
                return res.status(400).json({ success: false, message: 'Không tìm thấy file ảnh' });
            }
            const id = req.user.id;
            const avatarFile = req.files.avatar;

            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: "avatars" },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(avatarFile.data);
            });
            const newAvatarUrl = result.secure_url;
            const isUpdated = await userModel.updateAvatar(id, newAvatarUrl);

            if (isUpdated) {
                return res.status(200).json({
                    success: true,
                    message: "Cập nhật ảnh thành công",
                    user: { avatar: newAvatarUrl }
                });
            }
            res.status(400).json({ success: false, message: "Cập nhật DB thất bại" });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async updateProfile(req, res) {
        try {

            const userId = req.user.id;
            const {
                name,
                email,
                phoneNumber
            } = req.body;

            const success = await userModel.updateProfile(
                userId,
                {
                    name,
                    email,
                    phoneNumber
                }
            );

            if (!success) {
                return res.status(400).json({
                    succeeded: false,
                    message: "Cập nhật thất bại!"
                });
            }


            const fullUserData =
                await userModel.getUserSessionData(userId);

            return res.status(200).json({
                succeeded: true,
                message: "Cập nhật thành công!",
                user: {
                    id: fullUserData.id,
                    name: fullUserData.name,
                    email: fullUserData.email,
                    role: fullUserData.role,
                    avatar: fullUserData.avatar,
                    address: fullUserData.diaChi ?? '',
                    phoneNumber: fullUserData.phoneNumber,
                    isVerified: true,
                    wallet: {
                        balance: fullUserData.balance,
                        frozenAmount: fullUserData.frozenAmount
                    }
                }
            });

        } catch (error) {

            res.status(500).json({
                succeeded: false,
                message: error.message
            });

        }
    }

    static async changePassword(req, res){
        try{
            const { oldPassword, newPassword } = req.body;
            const id = req.user.id;
            const user = await userModel.findById(id);
            if (!user) return res.status(404).json({ success: false, message: "User không tồn tại" });


            const isMatch = await compare(oldPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác' });
            }

             if (!await userController.validatePassword(newPassword)) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu quá yếu (Yêu cầu 8-100 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt)'
                });
            }
            const hashedPassword = await hash(newPassword, PASSWORD_HASH_ROUND);
            const isUpdated = await userModel.updatePassword(id, hashedPassword);
            if (isUpdated) {
                return res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công!' });
            }
            res.status(400).json({ success: false, message: 'Đổi mật khẩu thất bại' });
        }catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getAllUsers(req, res) {
        try {
            const { status, search } = req.query; 
            
            const users = await userModel.getAllUsers(status, search);
            
            const stats = await userModel.getUserStats();
            
            const formattedUsers = users.map(user => ({
                ...user,
                createdAt: new Date(user.createdAt).toLocaleDateString('vi-VN'),
                status: user.status 
            }));
            
            res.status(200).json({ 
                success: true, 
                data: formattedUsers,
                stats: stats 
            });
            
        } catch (error) {
            console.error("Lỗi khi lấy danh sách người dùng:", error);
            res.status(500).json({ 
                success: false, 
                message: "Có lỗi xảy ra khi tải dữ liệu người dùng" 
            });
        }
    }

    static async changeUserStatus(req, res) {
        try {
            const { userId, status } = req.body; 
            await userModel.updateStatus(userId, status);
            res.status(200).json({ success: true, message: "Cập nhật trạng thái thành công!" });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }


}