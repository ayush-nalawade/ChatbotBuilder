-- ============================================================
-- Migration 001: Add Secondary Indexes & Materialized Views
-- Eliminates all ALLOW FILTERING queries for production scale
-- Run once against your ScyllaDB keyspace
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- CONVERSATIONS TABLE
-- Primary key: conversation_id
-- Access patterns we need to support without ALLOW FILTERING:
--   1. WHERE user_phone + flow_id + status  (getActiveConversation — hot path, every message)
--   2. WHERE flow_id + status               (getActiveByFlow — admin live panel)
--   3. WHERE flow_id                        (getConversationsByFlow)
--   4. WHERE user_phone                     (getConversationsByPhone)
--   5. WHERE status                         (getConversationsByStatus — admin reporting)
-- ──────────────────────────────────────────────────────────────

-- View 1: lookup by (user_phone, flow_id)
-- Covers: getActiveConversation, findHumanTakeoverByPhone, findPendingAgentByPhone
CREATE MATERIALIZED VIEW IF NOT EXISTS conversations_by_user_flow AS
    SELECT * FROM conversations
    WHERE user_phone IS NOT NULL
      AND flow_id    IS NOT NULL
      AND conversation_id IS NOT NULL
    PRIMARY KEY ((user_phone, flow_id), conversation_id);

-- View 2: lookup by (flow_id, status)
-- Covers: getActiveByFlow, getConversationsByStatus (when used with flow_id)
CREATE MATERIALIZED VIEW IF NOT EXISTS conversations_by_flow_status AS
    SELECT * FROM conversations
    WHERE flow_id IS NOT NULL
      AND status  IS NOT NULL
      AND conversation_id IS NOT NULL
    PRIMARY KEY ((flow_id, status), conversation_id);

-- View 3: lookup by flow_id only
-- Covers: getConversationsByFlow
CREATE MATERIALIZED VIEW IF NOT EXISTS conversations_by_flow AS
    SELECT * FROM conversations
    WHERE flow_id IS NOT NULL
      AND conversation_id IS NOT NULL
    PRIMARY KEY (flow_id, conversation_id);

-- Index: user_phone (for getConversationsByPhone without flow_id context)
CREATE INDEX IF NOT EXISTS conversations_user_phone_idx ON conversations (user_phone);

-- Index: status (for admin-level getConversationsByStatus across all flows)
CREATE INDEX IF NOT EXISTS conversations_status_idx ON conversations (status);


-- ──────────────────────────────────────────────────────────────
-- FLOWS TABLE
-- Primary key: flow_id
-- Access patterns:
--   1. WHERE whatsapp_number              (getFlowByWhatsAppNumber — hot path, every message)
--   2. WHERE whatsapp_number + published  (isWhatsAppNumberTaken)
--   3. WHERE instagram_username           (getFlowByInstagramUsername)
-- ──────────────────────────────────────────────────────────────

-- View: lookup by whatsapp_number
-- Covers: getFlowByWhatsAppNumber, isWhatsAppNumberTaken
CREATE MATERIALIZED VIEW IF NOT EXISTS flows_by_whatsapp_number AS
    SELECT * FROM flows
    WHERE whatsapp_number IS NOT NULL
      AND flow_id IS NOT NULL
    PRIMARY KEY (whatsapp_number, flow_id);

-- View: lookup by instagram_username
-- Covers: getFlowByInstagramUsername
CREATE MATERIALIZED VIEW IF NOT EXISTS flows_by_instagram_username AS
    SELECT * FROM flows
    WHERE instagram_username IS NOT NULL
      AND flow_id IS NOT NULL
    PRIMARY KEY (instagram_username, flow_id);


-- ──────────────────────────────────────────────────────────────
-- USERS TABLE
-- Primary key: user_id
-- Access patterns:
--   1. WHERE email   (findByEmail — login, every API request)
-- ──────────────────────────────────────────────────────────────

-- Index: email (unique-ish, used at login time only)
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);


-- ──────────────────────────────────────────────────────────────
-- MESSAGES TABLE
-- Primary key: message_id
-- Note: The hot path already uses messages_by_conversation (proper design).
-- Only getMessagesByFlow and updateByWhatsAppMessageId still use ALLOW FILTERING.
-- ──────────────────────────────────────────────────────────────

-- Index: flow_id (for getMessagesByFlow — admin analytics, not hot path)
CREATE INDEX IF NOT EXISTS messages_flow_id_idx ON messages (flow_id);

-- Index: whatsapp_message_id (for updateByWhatsAppMessageId — delivery status updates)
CREATE INDEX IF NOT EXISTS messages_whatsapp_msg_id_idx ON messages (whatsapp_message_id);
