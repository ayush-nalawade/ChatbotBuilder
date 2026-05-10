const axios = require('axios');

class AiBotService {

    // Generate an AI reply based on system prompt + conversation history + new user message
    static async generateReply({ systemPrompt, conversationHistory, userMessage, model }) {
        try {
            const aiModel = model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

            // Build the messages array in OpenAI chat format
            const messages = [
                {
                    role   : 'system',
                    content: systemPrompt || 'You are a helpful assistant.',
                },
                ...conversationHistory,  // last N messages as { role, content }
                {
                    role   : 'user',
                    content: userMessage,
                },
            ];

            console.log(
                `[AiBotService] Calling model=${aiModel} history_len=${conversationHistory.length}`,
                true, true
            );

            const response = await axios({
                method : 'POST',
                url    : 'https://openrouter.ai/api/v1/chat/completions',
                headers: {
                    'Authorization'  : `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type'   : 'application/json',
                    'HTTP-Referer'   : process.env.APP_BASE_URL || 'http://localhost:3006',
                    'X-Title'        : 'ChatbotCRM AI Bot',
                },
                data   : {
                    model,
                    messages,
                    temperature: 0.7,
                    max_tokens : 500,
                },
                timeout: 15000, // 15 second timeout
            });

            const reply = response.data?.choices?.[0]?.message?.content?.trim();

            if (!reply) {
                throw new Error('Empty reply from AI model');
            }

            console.log(`[AiBotService] Reply generated: ${reply.substring(0, 80)}...`, true, true);
            return reply;

        } catch (error) {
            console.log(`[AiBotService] Error generating reply: ${error.message}`, true, true);
            throw error;
        }
    }
}

module.exports = AiBotService;
