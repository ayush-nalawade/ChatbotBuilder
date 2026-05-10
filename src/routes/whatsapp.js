const express = require('express');
const { authenticate } = require('../middleware/auth');
const WhatsAppController = require('../controllers/WhatsAppController');

const router = express.Router();
const whatsappController = new WhatsAppController();

// POST /api/whatsapp/groups
// Creates a new WhatsApp group
router.post('/groups', authenticate, whatsappController.createGroup);

module.exports = router;
