import AddressModel from "../models/addressModel.js";
import WalletModel from "../models/walletModel.js";

export default class CheckoutController {
    static async getCheckoutPageData(req, res) {
        try {
            const userId = req.user.id; 
            const addresses = await AddressModel.getAddressesByUserId(userId); //
            const wallet = await WalletModel.getWalletByUserId(userId);       
            const defaultAddress = addresses.find(addr => addr.isDefault === 1) || null;
            return res.status(200).json({
                success: true,
                data: {
                   
                    walletBalance: wallet.balance, 
                    defaultAddress: defaultAddress 
                }
            });

        } catch (error) {
            return res.status(500).json({ 
                success: false, 
                message: "Lỗi xử lý checkout tại Controller: " + error.message 
            });
        }
    }
    static async getWallet(req, res) {
        try {
            const userId = req.user.id;
            const wallet = await WalletModel.getWalletByUserId(userId);
            return res.status(200).json({ success: true, data: wallet });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }


    static async depositMoney(req, res) {
        try {
            const userId = req.user.id;
            const { amount } = req.body;

            const walletId = await WalletModel.getWalletIdByUserId(userId);
            const transactionId = await WalletModel.createTransaction(walletId, amount, 'Deposit', 'Pending');
            setTimeout(async () => {
                try {
                    await WalletModel.updateBalanceAndStatus(transactionId, walletId, amount);
                    console.log("Mô phỏng nạp tiền thành công cho giao dịch:", transactionId);
                } catch (err) {
                    console.error("Lỗi tự động cập nhật ví:", err);
                }
            }, 2000); 

            return res.status(200).json({ 
                success: true, 
                transactionId, 
                message: "Hệ thống đang xử lý, tiền sẽ vào ví sau 2 giây..." 
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async confirmPayment(req, res) {
        try {
            const { transactionId, walletId, amount } = req.body;
            
            await WalletModel.updateBalanceAndStatus(transactionId, walletId, amount);
            
            return res.status(200).json({ success: true, message: "Nạp tiền thành công!" });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Lỗi cập nhật số dư: " + error.message });
        }
    }
}

