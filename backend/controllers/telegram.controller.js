const UserModel = require('../models/user.model');

const TelegramController = {
  // Generate Telegram Link Code
  generateLinkCode: async (req, res) => {
    try {
      const code = await UserModel.generateLinkCode(req.user.id);
      res.json({
        success: true,
        code,
        message: `Send this command to Telegram bot: /connect ${code}`
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error generating code: ' + err.message });
    }
  },

  // Get Telegram Linking Status
  getTelegramStatus: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id);
      res.json({
        success: true,
        linked: Boolean(user && user.telegram_chat_id),
        chatId: user ? user.telegram_chat_id : null,
        linkCode: user ? user.telegram_link_code : null
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error getting status: ' + err.message });
    }
  }
};

module.exports = TelegramController;
