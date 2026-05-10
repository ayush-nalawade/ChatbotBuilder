const WhatsAppService = require('../services/WhatsAppService');
const { ValidationError } = require('../utils/errors');

class WhatsAppController {
    /**
     * Create a new WhatsApp group
     */
    async createGroup(req, res, next) {
        try {
            const { subject, participants } = req.body;

            if (!subject || !subject.trim()) {
                throw new ValidationError('Group subject is required');
            }

            const whatsappService = new WhatsAppService(
                process.env.WHATSAPP_ACCESS_TOKEN,
                process.env.WHATSAPP_PHONE_NUMBER_ID
            );

            // Create group via WhatsApp API
            const response = await whatsappService.createGroup(subject, participants);

            res.status(201).json({
                success: true,
                message: 'Group creation request initiated',
                data: response,
                note: 'Note: If using the official WhatsApp Cloud API, groups are invite-only. A webhook will emit the invite link.'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = WhatsAppController;
